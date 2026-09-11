import { ForbiddenError } from '@visin/backend-core';
import type { ILabelJob } from '../models/LabelJob';
import { checkMembership } from '../clients/groupServiceClient';

/** Group members may review any status; public sharing is explicit and active-only. */
export async function getJobReadAccess(job: ILabelJob, userId?: string) {
  const membership = userId ? await checkMembership(job.groupId, userId) : { member: false, role: null };
  const member = membership.member === true;
  if (!member && !(job.isPublic === true && job.status === 'active')) {
    throw new ForbiddenError('This job is not shared publicly. Group membership is required.');
  }
  return { member, isAdmin: member && (membership.role === 'owner' || membership.role === 'admin') };
}
