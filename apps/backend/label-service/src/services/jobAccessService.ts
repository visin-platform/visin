import { atLeast, ForbiddenError, UnauthorizedError, type Permission } from '@visin/backend-core';
import type { ILabelJob } from '../models/LabelJob';
import * as datasets from '../clients/datasetServiceClient';

/**
 * What one caller may do with a job: whatever they may do with its dataset,
 * which dataset-service decides (its owner, the owning group's current roles,
 * its visibility). A dataset in the trash takes its jobs with it.
 *
 * A draft from before every job needed a dataset reaches only its creator.
 */
export async function jobPermission(job: ILabelJob, userId?: string): Promise<Permission> {
  if (!job.datasetId) return userId && job.createdBy.userId === userId ? 'manage' : 'none';
  return datasets.getPermission(job.datasetId, userId);
}

export interface JobAccess {
  permission: Permission;
  /** contributes to the dataset: sees everything about the job */
  member: boolean;
  /** manages the dataset: runs the job, sees who answered */
  isAdmin: boolean;
  /** may label it now */
  canWork: boolean;
}

/**
 * Who may see a job: its dataset's contributors, and for a job made public,
 * anyone who may read its dataset, which is everyone while the dataset is
 * public. Making the dataset private closes the job to outsiders by itself.
 */
export async function getJobReadAccess(job: ILabelJob, userId?: string): Promise<JobAccess> {
  const permission = await jobPermission(job, userId);
  const member = atLeast(permission, 'contribute');
  const open = job.isPublic === true && job.status === 'active' && atLeast(permission, 'read');
  if (!member && !open) {
    throw new ForbiddenError('This job is not shared publicly. Access to its dataset is required.');
  }
  const workable = job.status === 'active' || (member && job.status === 'completed');
  return { permission, member, isAdmin: atLeast(permission, 'manage'), canWork: Boolean(userId) && workable };
}

const requireSignedIn = (userId?: string): string => {
  if (!userId) throw new UnauthorizedError('Authenticated user required');
  return userId;
};

/** Running a job (create, change, export, delete) takes managing its dataset. */
export async function assertJobAdmin(job: ILabelJob, userId?: string): Promise<void> {
  requireSignedIn(userId);
  if (!atLeast(await jobPermission(job, userId), 'manage')) {
    throw new ForbiddenError("Only the dataset's owner, or an owner or admin of the group that owns it, can manage this job");
  }
}

/** Labeling takes contributing to the dataset, or a public job on a dataset the caller may read. */
export async function assertCanWork(job: ILabelJob, userId?: string): Promise<void> {
  requireSignedIn(userId);
  const access = await getJobReadAccess(job, userId);
  if (!access.canWork) throw new ForbiddenError('This job is not open for labeling');
}
