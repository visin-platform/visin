import { UserPayload } from '@visin/backend-core';
import { LabelJob, ILabelJob } from '../models/LabelJob';
import { CreateJobBody } from '../validation/jobSchemas';

export const createJob = async (user: UserPayload, data: CreateJobBody): Promise<ILabelJob> => {
  return LabelJob.create({
    ...data,
    createdBy: {
      userId: user.id,
      email: (user.email || '').toLowerCase(),
      name: user.name
    },
    status: 'draft'
  });
};

// TODO(phase-1): visibility should be "jobs of groups I'm a member of" via the
// group-membership middleware; until then, only the creator sees their jobs.
export const listJobsForUser = async (userId: string): Promise<ILabelJob[]> => {
  return LabelJob.find({ 'createdBy.userId': userId }).sort({ updatedAt: -1 });
};
