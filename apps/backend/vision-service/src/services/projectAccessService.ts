import Project, { IProject } from '../models/Project';
import Training from '../models/Training';

/** Resolves a project by slug first, falling back to its ObjectId. Null if neither matches. */
async function resolveProject(projectId: string): Promise<IProject | null> {
  const bySlug = await Project.findOne({ slug: projectId });
  if (bySlug) return bySlug;
  return Project.findById(projectId).catch(() => null);
}

/**
 * True if userId may access projectId: public projects are open to everyone,
 * private ones only to their owner. No projectId means the resource isn't
 * scoped to a project (e.g. a standalone training) — always allowed.
 *
 * Shared by every controller that resolves a project, directly or via a
 * parent training/epoch, so privacy rules stay in one place. Originally
 * lived only in trainingService; extracted so benchmark/comparison/epoch/
 * test-result/visualization controllers can enforce the same rule instead
 * of leaking private-project data through child resources.
 */
export async function checkProjectAccess(userId: string | undefined, projectId: string | undefined | null): Promise<boolean> {
  if (!projectId) return true;

  const project = await resolveProject(projectId);
  if (!project) return false;

  if (project.isPublic) return true;
  if (!userId) return false;
  return project.ownerId === userId;
}

/**
 * True only if userId is projectId's owner — public projects don't relax
 * this. For operations that are administrative on the project itself (API
 * token management) rather than reading/writing the project's data, where
 * "anyone can see/use a public project" is the wrong rule: a project being
 * public shouldn't let any visitor list, create, or revoke its API tokens.
 */
export async function isProjectOwner(userId: string | undefined, projectId: string | undefined | null): Promise<boolean> {
  if (!userId || !projectId) return false;
  const project = await resolveProject(projectId);
  return project?.ownerId === userId;
}

/**
 * Project ids userId may see: public projects plus, if logged in, ones they
 * own. Used to scope "list everything" queries (no explicit projectId/
 * training_uuid filter given) so they don't return every project's data
 * regardless of privacy — the single-resource `checkProjectAccess` check
 * above only ever fires when a specific id was supplied to check.
 */
export async function getVisibleProjectIds(userId: string | undefined): Promise<string[]> {
  const query = userId ? { $or: [{ isPublic: true }, { ownerId: userId }] } : { isPublic: true };
  const projects = await Project.find(query).select('_id');
  return projects.map(p => p._id.toString());
}

/**
 * Training ids userId may see: those with no project (unscoped/global) or
 * belonging to a visible project. Building block for scoping benchmark/
 * comparison/test-result/visualization list queries that key off `trainingId`
 * rather than `projectId` directly.
 */
export async function getVisibleTrainingIds(userId: string | undefined): Promise<string[]> {
  const projectIds = await getVisibleProjectIds(userId);
  const trainings = await Training.find({
    deletedAt: null,
    $or: [
      { projectId: { $in: projectIds } },
      { projectId: { $exists: false } },
      { projectId: null }
    ]
  }).select('_id');
  return trainings.map(t => t._id.toString());
}

/**
 * Enforces API-token project scoping on writes: when the caller
 * authenticated via a project-scoped API token (`apiTokenMiddleware` sets
 * `req.projectId`), a resource resolved indirectly — e.g. the training an
 * epoch/benchmark/test-result/visualization is being written under — must
 * belong to that same project. Without this, a token scoped to project A
 * could write into project B's trainings just by naming their id/uuid in the
 * request body. Not an API-token request (JWT session or anonymous, i.e. no
 * `reqProjectId`) is always in scope — this check only constrains tokens.
 */
export function isWithinTokenScope(reqProjectId: string | undefined, resourceProjectId: string | null | undefined): boolean {
  if (!reqProjectId) return true;
  return resourceProjectId != null && resourceProjectId.toString() === reqProjectId.toString();
}
