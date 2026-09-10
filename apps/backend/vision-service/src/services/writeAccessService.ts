import { ForbiddenError, NotFoundError, UnauthorizedError } from '@visin/backend-core';
import Project from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import DatasetAnalysis from '../models/DatasetAnalysis';
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

/** Shared libraries remain public; their creator controls mutations. */
export function assertLibraryWrite(resource: Pick<OwnedResource, 'ownerId' | 'deletedAt'>, userId?: string): void {
  requireActor(userId);
  if (resource.deletedAt || resource.ownerId !== userId) throw new ForbiddenError('Only the library owner can modify it');
}

/** Dataset images and categories belong to the dataset analysis shown by the UI. */
export async function getDatasetParent(datasetId: string) {
  const parent = await DatasetAnalysis.findById(datasetId);
  if (!parent) throw new NotFoundError('Dataset not found');
  return parent;
}

export async function assertDatasetWrite(datasetId: string, userId?: string): Promise<void> {
  assertLibraryWrite(await getDatasetParent(datasetId), userId);
}

export async function assertEpochWrite(epochUuid: string, userId?: string, scope?: string) {
  const epoch = await Epoch.findOne({ epoch_uuid: epochUuid, deletedAt: null });
  const training = epoch ? await Training.findOne({ _id: epoch.trainingId, deletedAt: null }) : null;
  if (!isWithinTokenScope(scope, training?.projectId)) throw new ForbiddenError();
  await assertResourceWrite(training, userId);
  return epoch!;
}
