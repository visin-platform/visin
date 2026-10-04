import {
  atLeast,
  createGroupServiceClient,
  readableOwnerFilter,
  resolveAccess,
  type GroupServiceClient,
  type Permission
} from '@visin/backend-core';
import type { QueryFilter } from 'mongoose';
import { getUserGroups } from '../clients/projectGroupsClient';
import { requestIdentityContext } from '../middleware/requestIdentityContext';
import Project, { IProject } from '../models/Project';
import Training from '../models/Training';
import { projectTokenContext, tokenProjectId } from '../middleware/projectTokenContext';

/**
 * The caller's own groups and roles, as backend-core's ownership rules ask for
 * them: one group-service call per request, whatever the number of projects.
 * Anyone else's membership reads as none; `membershipOf` answers for others.
 */
export const callerGroups: GroupServiceClient = {
  async getMyGroups(userId) {
    return (await getUserGroups(userId)).map(group => ({ groupId: group.id, name: group.name, role: group.role ?? 'member' }));
  },
  async checkMembership(groupId, userId) {
    const group = (await getUserGroups(userId)).find(candidate => candidate.id === groupId);
    return group ? { member: true, role: group.role ?? 'member' } : { member: false, role: null };
  }
};

let internalGroups: GroupServiceClient | undefined;

/** Any account's membership in any group: a transfer to a person asks whether they are in the group. */
export const membershipOf = (groupId: string, userId: string) => {
  if (userId === requestIdentityContext.getStore()?.request.user?.id) return callerGroups.checkMembership(groupId, userId);
  internalGroups ??= createGroupServiceClient('vision-service');
  return internalGroups.checkMembership(groupId, userId);
};

/** A project that is not in the trash. */
export const LIVE_PROJECT = { trashedAt: null } as const;

/** ObjectId-shaped references are canonical IDs; other identifiers may be slugs. Trashed projects included. */
export async function resolveProject(projectId: string): Promise<IProject | null> {
  // Stored ObjectIds must not be reinterpreted as a different project's slug.
  if (/^[0-9a-fA-F]{24}$/.test(projectId)) {
    return Project.findById(projectId);
  }
  const bySlug = await Project.findOne({ slug: projectId });
  if (bySlug) return bySlug;
  return Project.findById(projectId).catch(() => null);
}

/**
 * What userId may do with one project.
 *
 * - Its owner decides: the owning person has `own`; for a group-owned project,
 *   the caller's current role in that group (backend-core `resolveAccess`).
 * - An editor group, one the project is shared with, gives its members
 *   `contribute`.
 * - `public` gives anyone `read`.
 * - A key limited to a project reaches only that project.
 * - A trashed project gives nothing, unless `trashed` asks about the trash itself.
 *
 * Membership is read from group-service once per request, never from claims.
 */
export async function projectPermission(
  project: IProject | null,
  userId: string | undefined,
  { trashed = false }: { trashed?: boolean } = {}
): Promise<Permission> {
  // No owner: a project the owner migration has not reached yet, which nobody reaches until it has.
  if (!project?.owner || (project.trashedAt && !trashed)) return 'none';
  if (!isWithinTokenScope(undefined, project._id.toString())) return 'none';
  const signedIn = Boolean(userId);
  const membership =
    signedIn && project.owner.kind === 'group' ? await callerGroups.checkMembership(project.owner.id, userId!) : undefined;
  const permission = resolveAccess(project, userId, membership);
  if (atLeast(permission, 'contribute') || !signedIn || !project.editorGroupIds?.length) return permission;
  const groups = await getUserGroups(userId);
  return groups.some(group => project.editorGroupIds!.includes(group.id)) ? 'contribute' : permission;
}

/**
 * What the caller could do with a project if a credential limited to one project did not confine them: their own
 * permission, as an unlimited session would see it. A limited key is told its limit only for a project its owner
 * can read; for one they cannot, the answer must read exactly as for a project that does not exist.
 */
export const permissionIgnoringKeyLimit = (project: IProject | null, userId: string | undefined): Promise<Permission> =>
  projectTokenContext.exit(() => projectPermission(project, userId));

/** The permission on a project named by id or slug; `none` for one that does not exist. */
export async function projectPermissionById(userId: string | undefined, projectId: string | undefined | null): Promise<Permission> {
  if (!projectId) return 'none';
  return projectPermission(await resolveProject(projectId.toString()), userId);
}

/**
 * True if userId may read projectId. Every training has a project, so no
 * project means no access. Shared by every controller that resolves a project,
 * directly or through a parent training or epoch, so privacy rules stay in one
 * place.
 */
export async function checkProjectAccess(userId: string | undefined, projectId: string | undefined | null): Promise<boolean> {
  return atLeast(await projectPermissionById(userId, projectId), 'read');
}

/** May add to the project: runs, results, findings, keys limited to it. */
export async function canEditProject(project: IProject | null, userId?: string): Promise<boolean> {
  if (!userId) return false;
  return atLeast(await projectPermission(project, userId), 'contribute');
}

/**
 * A Mongo filter on projects the caller may do at least `min` with: owner and
 * visibility (backend-core `readableOwnerFilter`), plus editor groups up to
 * `contribute`, confined to a project credential's own project. Live projects,
 * or with `trashed` only those in the trash.
 */
export async function projectFilter(
  userId: string | undefined,
  min: Permission = 'read',
  { trashed = false }: { trashed?: boolean } = {}
): Promise<QueryFilter<IProject>> {
  const signedIn = Boolean(userId);
  const mine = signedIn ? await callerGroups.getMyGroups(userId!) : [];
  const owners = readableOwnerFilter(userId, mine, min) as { $or?: Record<string, unknown>[] };
  const clauses = [...(owners.$or ?? [])];
  if (signedIn && mine.length > 0 && atLeast('contribute', min)) {
    clauses.push({ editorGroupIds: { $in: mine.map(group => group.groupId) } });
  }
  const scope = tokenProjectId();
  return {
    $and: [
      trashed ? { trashedAt: { $ne: null } } : LIVE_PROJECT,
      clauses.length > 0 ? { $or: clauses } : { _id: { $in: [] } },
      ...(scope ? [{ _id: scope }] : [])
    ]
  } as QueryFilter<IProject>;
}

/** Ids of the projects the caller may add to. */
export async function getEditableProjectIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const projects = await Project.find(await projectFilter(userId, 'contribute')).select('_id');
  return projects.map(project => project._id.toString());
}

/**
 * A `checkProjectAccess` bound to one user and memoized on project id, for
 * loops that check row after row.
 *
 * Each bare `checkProjectAccess` runs `resolveProject`, i.e. up to two
 * indexed queries (`findOne({slug})` then `findById`), so a 100-row
 * comparison issues ~200 project lookups for what is usually a handful of
 * distinct projects. Semantics are identical — the same id yields the same
 * answer — the only change is that repeats are served from the memo.
 *
 * Deliberately per-call, not a module-level cache: the memo lives exactly as
 * long as the request that made it, so a privacy change is never served from
 * a stale entry.
 */
export function createProjectAccessChecker(
  userId: string | undefined
): (projectId: string | undefined | null) => Promise<boolean> {
  const inFlight = new Map<string, Promise<boolean>>();

  return (projectId) => {
    if (!projectId) return Promise.resolve(false);

    // String only as the map key — `checkProjectAccess` still receives the
    // caller's original value, so nothing about the lookup changes.
    const key = projectId.toString();
    let result = inFlight.get(key);
    if (!result) {
      result = checkProjectAccess(userId, projectId);
      inFlight.set(key, result);
    }
    return result;
  };
}

/**
 * Project ids userId may see: public projects plus, if logged in, their own,
 * their groups', and those shared with their groups. Scopes "list everything"
 * queries (no explicit projectId/training_uuid filter given) so they don't
 * return every project's data regardless of privacy.
 */
export async function getVisibleProjectIds(userId: string | undefined): Promise<string[]> {
  const projects = await Project.find(await projectFilter(userId, 'read')).select('_id');
  return projects.map(p => p._id.toString());
}

/**
 * Training ids userId may see: live ones in a visible project. Building block
 * for scoping benchmark/comparison/test-result/visualization list queries that
 * key off `trainingId` rather than `projectId` directly.
 */
export async function getVisibleTrainingIds(userId: string | undefined): Promise<string[]> {
  const projectIds = await getVisibleProjectIds(userId);
  const trainings = await Training.find({ deletedAt: null, projectId: { $in: projectIds } }).select('_id');
  return trainings.map(t => t._id.toString());
}

/**
 * Enforces the project limit of an API key: the verified request-local
 * constraint always applies, including when a controller omits its explicit
 * argument. On writes, when the caller authenticated with a key limited to a
 * project (`projectKeyAuth` sets `req.projectId`), a resource resolved
 * indirectly — e.g. the training an epoch/benchmark/test-result/visualization
 * is being written under — must belong to that same project. Without this, a
 * key limited to project A could write into project B's trainings just by
 * naming their id/uuid in the request body. Any other request (a session, an
 * unlimited key, anonymous) is always in scope.
 */
export function isWithinTokenScope(reqProjectId: string | undefined, resourceProjectId: string | null | undefined): boolean {
  const verifiedScope = tokenProjectId();
  if (verifiedScope && resourceProjectId?.toString() !== verifiedScope) return false;
  if (!reqProjectId) return true;
  return resourceProjectId != null && resourceProjectId.toString() === reqProjectId.toString();
}
