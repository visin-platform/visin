import { Types } from 'mongoose';
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
    status: 'draft',
    isPublic: false
  });
};

export type JobWithProgress = Record<string, unknown> & { progress: JobProgress };

/**
 * role=worker (default): active jobs in any of my groups — the workable list.
 * role=admin: every job (any status) in groups where I am owner/admin.
 *
 * Progress rides along so the list can show how far each job has got without a
 * detail request per card.
 */
export const listJobsForUser = async (
  userId: string,
  role: 'worker' | 'admin'
): Promise<JobWithProgress[]> => {
  const myGroups = await groups.getMyGroups(userId);
  const jobs =
    role === 'admin'
      ? await LabelJob.find({
          groupId: { $in: myGroups.filter((g) => g.role === 'owner' || g.role === 'admin').map((g) => g.groupId) }
        }).sort({ updatedAt: -1 })
      : await LabelJob.find({ groupId: { $in: myGroups.map((g) => g.groupId) }, status: 'active' }).sort({
          updatedAt: -1
        });

  const progress = await progressForJobs(jobs, userId);
  return jobs.map((job) => ({ ...job.toObject(), progress: progress.get(job._id.toString())! }));
};

/**
 * A job as an anonymous visitor may see it: everything except who set it up.
 *
 * `createdBy` carries an email address, and the same reasoning applies to it as
 * to the per-labeler stats breakdown — the progress is what is being shared, not
 * the identities of the people behind it.
 */
export const withoutCreatorIdentity = (job: ILabelJob): Record<string, unknown> => {
  const { createdBy: _createdBy, ...rest } = job.toObject();
  return rest;
};

/**
 * Only deliberately published, active jobs are visible outside their group.
 */
export const listPublicJobs = async (): Promise<JobWithProgress[]> => {
  const jobs = await LabelJob.find({ status: 'active', isPublic: true }).sort({ updatedAt: -1 });
  const progress = await progressForJobs(jobs, '');
  return jobs.map((job) => ({
    ...withoutCreatorIdentity(job),
    progress: progress.get(job._id.toString())!
  }));
};

export const getJob = async (jobId: string): Promise<ILabelJob> => {
  const job = await LabelJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  return job;
};

export const setJobVisibility = async (jobId: string, isPublic: boolean): Promise<ILabelJob> => {
  const job = await LabelJob.findByIdAndUpdate(jobId, { $set: { isPublic } }, { new: true });
  if (!job) throw new NotFoundError('Job not found');
  return job;
};

export interface JobProgress {
  tasks: number;
  completed: number; // tasks that reached redundancy K
  answers: number;
  myAnswers: number;
}

/**
 * Progress for a whole list of jobs in two queries, whatever the list length.
 *
 * Tasks are grouped by `answersCount` rather than counted against each job's
 * completion threshold in the query: redundancy is per job, so a `$gte` filter
 * would need one query per job. The bucket count is bounded by the maximum
 * redundancy (10), not by task count, so the threshold is cheap to apply here.
 */
export const progressForJobs = async (
  jobs: Pick<ILabelJob, '_id' | 'redundancy'>[],
  userId: string
): Promise<Map<string, JobProgress>> => {
  const byJob = new Map<string, JobProgress>(
    jobs.map((job) => [job._id.toString(), { tasks: 0, completed: 0, answers: 0, myAnswers: 0 }])
  );
  if (byJob.size === 0) {
    return byJob;
  }

  const jobIds = jobs.map((job) => job._id);
  const [taskBuckets, answerRows] = await Promise.all([
    LabelTask.aggregate<{ _id: { jobId: Types.ObjectId; answersCount: number }; count: number }>([
      { $match: { jobId: { $in: jobIds } } },
      { $group: { _id: { jobId: '$jobId', answersCount: '$answersCount' }, count: { $sum: 1 } } }
    ]),
    LabelAnswer.aggregate<{ _id: Types.ObjectId; answers: number; myAnswers: number }>([
      { $match: { jobId: { $in: jobIds } } },
      {
        $group: {
          _id: '$jobId',
          answers: { $sum: 1 },
          myAnswers: { $sum: { $cond: [{ $eq: ['$userId', userId] }, 1, 0] } }
        }
      }
    ])
  ]);

  const redundancyByJob = new Map(jobs.map((job) => [job._id.toString(), job.redundancy]));
  for (const bucket of taskBuckets) {
    const progress = byJob.get(bucket._id.jobId.toString());
    if (!progress) {
      continue;
    }
    progress.tasks += bucket.count;
    if (bucket._id.answersCount >= (redundancyByJob.get(bucket._id.jobId.toString()) ?? 1)) {
      progress.completed += bucket.count;
    }
  }
  for (const row of answerRows) {
    const progress = byJob.get(row._id.toString());
    if (progress) {
      progress.answers = row.answers;
      progress.myAnswers = row.myAnswers;
    }
  }
  return byJob;
};

export const getJobProgress = async (job: ILabelJob, userId: string): Promise<JobProgress> =>
  (await progressForJobs([job], userId)).get(job._id.toString())!;

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
