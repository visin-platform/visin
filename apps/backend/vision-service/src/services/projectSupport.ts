import { lookupOwnerIdentities, type OwnerIdentity } from '../clients/ownerIdentityClient';
import { atLeast, ForbiddenError, NotFoundError, recordResourceEvent, UnauthorizedError, type Permission, type ResourceOwner } from '@visin/backend-core';
import { IProject } from '../models/Project';
import { callerGroups, projectPermission, resolveProject } from './projectAccessService';
import { coverUrlsFor } from './projectCoverService';

export interface ProjectPermissions {
  read: boolean;
  contribute: boolean;
  manage: boolean;
  own: boolean;
}

const permissionsOf = (permission: Permission): ProjectPermissions => ({
  read: atLeast(permission, 'read'),
  contribute: atLeast(permission, 'contribute'),
  manage: atLeast(permission, 'manage'),
  own: atLeast(permission, 'own')
});

/**
 * A project as the API returns it: its stored fields, less the legacy
 * `ownerId` and `isPublic` a migrated document still carries, plus what the
 * caller may do with it and who owns it: a group the caller is in by its name, a person by the
 * handle, name and avatar they agreed to show (see `OwnerIdentity`).
 */
export type ProjectView = Record<string, unknown> & {
  owner: ResourceOwner & { name?: string; handle?: string; picture?: string };
  permissions: ProjectPermissions;
};

/** `owners` is what `lookupOwnerIdentities` found for a whole list, so a list asks once rather than per row. */
export async function toProjectView(
  project: IProject,
  userId: string | undefined,
  permission?: Permission,
  owners?: Map<string, OwnerIdentity>
): Promise<ProjectView> {
  const held = permission ?? (await projectPermission(project, userId, { trashed: true }));
  const { ownerId: _ownerId, isPublic: _isPublic, __v: _v, cover, ...fields } = project.toObject() as Record<string, unknown> & {
    cover?: { visualizationUuid: string };
  };
  // What the owner agreed to show anyone; a group's members also see its name when it has no public page.
  const { id: _id, ...shown } = (owners ?? (await lookupOwnerIdentities([project.owner]))).get(project.owner.id) ?? { id: '' };
  let identity: Partial<OwnerIdentity> = shown;
  if (project.owner.kind === 'group' && userId) {
    const name = (await callerGroups.getMyGroups(userId)).find(group => group.groupId === project.owner.id)?.name;
    if (name) identity = { ...shown, name };
  }
  return {
    ...fields,
    // The visualization chosen, not the storage id behind it.
    ...(cover ? { cover: { visualizationUuid: cover.visualizationUuid } } : {}),
    owner: { kind: project.owner.kind, id: project.owner.id, ...identity },
    permissions: permissionsOf(held)
  };
}

/** The views with each card's picture added as `coverUrl`, where there is one. */
export async function withCovers<T extends ProjectView>(projects: IProject[], views: T[], userId: string | undefined): Promise<T[]> {
  const covers = await coverUrlsFor(projects, userId);
  return views.map((view, index) => {
    const url = covers.get(String(projects[index]._id));
    return url ? { ...view, coverUrl: url } : view;
  });
}

/** The project, when the caller may do at least `min` with it: 404 when it does not exist, 403 otherwise. */
export async function requireProject(identifier: string, userId: string | undefined, min: Permission = 'read'): Promise<IProject> {
  const project = await resolveProject(identifier);
  if (!project || project.trashedAt) throw new NotFoundError('Project not found');
  if (!atLeast(await projectPermission(project, userId), min)) {
    if (!userId && min !== 'read') throw new UnauthorizedError('Authentication required');
    throw new ForbiddenError(min === 'read' ? undefined : `This needs ${min} permission on the project`);
  }
  return project;
}

export const recordEvent = (
  project: IProject,
  actorId: string,
  action: 'transfer' | 'visibility' | 'trash' | 'restore' | 'purge',
  { owner = project.owner, ...extra }: { owner?: ResourceOwner; to?: ResourceOwner; visibility?: string } = {}
) =>
  recordResourceEvent({
    service: 'vision-service',
    resourceType: 'project',
    resourceId: project._id.toString(),
    resourceName: project.name,
    action,
    actorId,
    owner,
    ...extra
  });
