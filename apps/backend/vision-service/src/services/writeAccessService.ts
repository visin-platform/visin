import { ForbiddenError, UnauthorizedError } from '@visin/backend-core';
import Project from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import { canEditProject, isWithinTokenScope } from './projectAccessService';

export function requireActor(userId: string | undefined): string {
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

export interface OwnedResource {
  ownerId?: string;
  projectId?: string | null;
  deletedAt?: Date | null;
}

export async function canWriteResource(resource: OwnedResource | null | undefined, userId?: string): Promise<boolean> {
  if (!resource || resource.deletedAt || !userId) return false;
  if (!isWithinTokenScope(undefined, resource.projectId)) return false;
  if (resource.projectId) {
    const project = await Project.findById(resource.projectId);
    return canEditProject(project, userId);
  }
  return resource.ownerId === userId;
}

export async function assertResourceWrite(resource: OwnedResource | null | undefined, userId?: string): Promise<void> {
  requireActor(userId);
  if (!(await canWriteResource(resource, userId))) throw new ForbiddenError('Write permission is required for this resource');
}

export async function assertEpochWrite(epochUuid: string, userId?: string, scope?: string) {
  const epoch = await Epoch.findOne({ epoch_uuid: epochUuid, deletedAt: null });
  const training = epoch ? await Training.findOne({ _id: epoch.trainingId, deletedAt: null }) : null;
  if (!isWithinTokenScope(scope, training?.projectId)) throw new ForbiddenError();
  await assertResourceWrite(training, userId);
  return epoch!;
}
