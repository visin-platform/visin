import { canChangeItem, ForbiddenError, UnauthorizedError } from '@visin/backend-core';
import { tokenProjectId } from '../middleware/projectTokenContext';
import Project from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import { isWithinTokenScope, projectPermission } from './projectAccessService';

export function requireActor(userId: string | undefined): string {
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

export interface OwnedResource {
  /** who added it: with `contribute` on its project, only they may change it */
  ownerId?: string;
  projectId?: string | null;
  deletedAt?: Date | null;
}

/**
 * Whether userId may add or change something in a project: anything with
 * `manage`, and what they added themselves with `contribute`. A new item is
 * judged with the caller as its owner.
 *
 * The one thing outside a project is a comparison across projects, which is
 * personal: only its creator changes it, and never through a project credential.
 */
export async function canWriteResource(resource: OwnedResource | null | undefined, userId?: string, allowPersonal = false): Promise<boolean> {
  if (!resource || resource.deletedAt || !userId) return false;
  if (!resource.projectId) return allowPersonal && !tokenProjectId() && Boolean(resource.ownerId) && resource.ownerId === userId;
  if (!isWithinTokenScope(undefined, resource.projectId)) return false;
  const project = await Project.findById(resource.projectId);
  return canChangeItem(await projectPermission(project, userId), resource.ownerId, userId);
}

export async function assertResourceWrite(resource: OwnedResource | null | undefined, userId?: string, allowPersonal = false): Promise<void> {
  requireActor(userId);
  if (!(await canWriteResource(resource, userId, allowPersonal))) throw new ForbiddenError('Write permission is required for this resource');
}

export async function assertEpochWrite(epochUuid: string, userId?: string, scope?: string) {
  const epoch = await Epoch.findOne({ epoch_uuid: epochUuid, deletedAt: null });
  const training = epoch ? await Training.findOne({ _id: epoch.trainingId, deletedAt: null }) : null;
  if (!isWithinTokenScope(scope, training?.projectId)) throw new ForbiddenError();
  await assertResourceWrite(training, userId);
  return epoch!;
}
