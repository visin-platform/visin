import { BadRequestError, ConflictError, NotFoundError, UserPayload } from '@visin/backend-core';
import { LabelJob, ILabelJob, JobStatus } from '../models/LabelJob';
import { LabelBundle } from '../models/LabelBundle';
import { LabelTask } from '../models/LabelTask';
import { LabelAnswer } from '../models/LabelAnswer';
import { CreateJobBody } from '../validation/jobSchemas';
import * as groups from '../clients/groupServiceClient';

export const createJob = async (user: UserPayload, data: CreateJobBody): Promise<ILabelJob> => {
  if (data.bundleId) {
    const bundle = await LabelBundle.findById(data.bundleId);
    if (!bundle) {
      throw new BadRequestError('Bundle not found');
    }
    if (bundle.groupId !== data.groupId) {
      throw new BadRequestError('Bundle belongs to a different group');
    }
  }
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

/**
 * role=worker (default): active jobs in any of my groups — the workable list.
 * role=admin: every job (any status) in groups where I am owner/admin.
 */
export const listJobsForUser = async (userEmail: string, role: 'worker' | 'admin'): Promise<ILabelJob[]> => {
  const myGroups = await groups.getMyGroups(userEmail);
  if (role === 'admin') {
    const adminGroupIds = myGroups.filter((g) => g.role === 'owner' || g.role === 'admin').map((g) => g.groupId);
    return LabelJob.find({ groupId: { $in: adminGroupIds } }).sort({ updatedAt: -1 });
  }
  const groupIds = myGroups.map((g) => g.groupId);
  return LabelJob.find({ groupId: { $in: groupIds }, status: 'active' }).sort({ updatedAt: -1 });
};

export const getJob = async (jobId: string): Promise<ILabelJob> => {
  const job = await LabelJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  return job;
};

export interface JobProgress {
  tasks: number;
  completed: number; // tasks that reached redundancy K
  answers: number;
  myAnswers: number;
}

export const getJobProgress = async (job: ILabelJob, userId: string): Promise<JobProgress> => {
  const [tasks, completed, answers, myAnswers] = await Promise.all([
    LabelTask.countDocuments({ jobId: job._id }),
    LabelTask.countDocuments({ jobId: job._id, answersCount: { $gte: job.redundancy } }),
    LabelAnswer.countDocuments({ jobId: job._id }),
    LabelAnswer.countDocuments({ jobId: job._id, userId })
  ]);
  return { tasks, completed, answers, myAnswers };
};

const TRANSITIONS: Record<string, { from: JobStatus[]; to: JobStatus }> = {
  activate: { from: ['draft', 'paused'], to: 'active' },
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  archive: { from: ['draft', 'active', 'paused', 'completed'], to: 'archived' }
};

export type JobAction = keyof typeof TRANSITIONS;

/**
 * Hard-delete a job and everything hanging off it.
 *
 * `archive` is a status, not a removal: an archived job kept its whole task set,
 * so three archived jobs over a 4k-frame bundle left 12,367 LabelTask documents
 * behind — each carrying a copy of its frame's selected mask metadata — with no
 * endpoint that could ever reach them. Deleting a job therefore deletes its
 * answers and tasks too; there is no soft-delete tier below this.
 *
 * Answers go first: an interrupted delete that has removed tasks but not answers
 * leaves answers pointing at nothing, while the reverse merely re-orphans tasks
 * a repeat call cleans up.
 */
export const deleteJob = async (jobId: string): Promise<{ tasks: number; answers: number }> => {
  const answers = await LabelAnswer.deleteMany({ jobId });
  const tasks = await LabelTask.deleteMany({ jobId });
  await LabelJob.deleteOne({ _id: jobId });
  return { tasks: tasks.deletedCount || 0, answers: answers.deletedCount || 0 };
};

export const transitionJob = async (jobId: string, action: JobAction): Promise<ILabelJob> => {
  const job = await getJob(jobId);
  const transition = TRANSITIONS[action];

  if (!transition.from.includes(job.status)) {
    throw new ConflictError(`Cannot ${action} a ${job.status} job`);
  }

  // A job can never go live against a bundle that is still uploading, or without tasks.
  if (transition.to === 'active' && job.status === 'draft') {
    if (!job.bundleId) {
      throw new ConflictError('Job has no bundle');
    }
    const bundle = await LabelBundle.findById(job.bundleId);
    if (!bundle || bundle.status !== 'ready') {
      throw new ConflictError('Bundle is not ready');
    }
    if (job.tasksCount === 0) {
      throw new ConflictError('Job has no tasks — materialize first');
    }
  }

  job.status = transition.to;
  await job.save();
  return job;
};
