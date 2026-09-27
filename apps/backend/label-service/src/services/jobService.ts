import { Types } from 'mongoose';
import { atLeast, BadRequestError, ConflictError, ForbiddenError, NotFoundError, UserPayload, logger } from '@visin/backend-core';
import { LabelJob, ILabelJob, JobStatus } from '../models/LabelJob';
import { LabelTask } from '../models/LabelTask';
import { LabelAnswer } from '../models/LabelAnswer';
import { CreateJobBody } from '../validation/jobSchemas';
import * as datasets from '../clients/datasetServiceClient';

/**
 * Create a draft job on a dataset the caller manages, and claim the dataset so
 * the files its tasks will show cannot be deleted or re-imported from under it.
 *
 * The job has no owner of its own: it follows its dataset. The claim is made
 * after the job exists (it names the job) and the job is removed again if the
 * claim fails — a job whose images are unprotected must not exist.
 */
export const createJob = async (user: UserPayload, data: CreateJobBody): Promise<ILabelJob> => {
  let dataset: datasets.DatasetSummary;
  try {
    dataset = await datasets.getDataset(data.datasetId);
  } catch (err) {
    if (err instanceof NotFoundError) throw new BadRequestError('Dataset not found');
    throw err;
  }
  if (!atLeast(await datasets.getPermission(data.datasetId, user.id), 'manage')) {
    throw new ForbiddenError("Only the dataset's owner, or an owner or admin of the group that owns it, can build a labeling job on it");
  }
  const groupNames = dataset.groups.map((group) => group.name);
  const unknown = [data.framesGroup, ...data.annotationSets].filter((name) => !groupNames.includes(name));
  if (unknown.length > 0) {
    throw new BadRequestError(`Not image groups of this dataset: ${unknown.join(', ')}`);
  }
  const job = await LabelJob.create({
    ...data,
    createdBy: {
      userId: user.id,
      email: (user.email || '').toLowerCase(),
      name: user.name
    },
    status: 'draft',
    isPublic: false
  });
  try {
    await datasets.addHold(data.datasetId, job._id.toString());
  } catch (err) {
    await LabelJob.deleteOne({ _id: job._id });
    throw err;
  }
  return job;
};

export type JobWithProgress = Record<string, unknown> & { progress: JobProgress };

/**
 * role=worker (default): active jobs on datasets I contribute to — the workable list.
 * role=admin: every job (any status) on datasets I manage, and my own drafts
 * from before every job needed a dataset.
 *
 * Progress rides along so the list can show how far each job has got without a
 * detail request per card.
 */
export const listJobsForUser = async (
  userId: string,
  role: 'worker' | 'admin'
): Promise<JobWithProgress[]> => {
  const datasetIds = await datasets.datasetIdsFor(userId, role === 'admin' ? 'manage' : 'contribute');
  const jobs =
    role === 'admin'
      ? await LabelJob.find({
          $or: [{ datasetId: { $in: datasetIds } }, { datasetId: { $exists: false }, 'createdBy.userId': userId }]
        }).sort({ updatedAt: -1 })
      : await LabelJob.find({ datasetId: { $in: datasetIds }, status: 'active' }).sort({ updatedAt: -1 });

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
 * Only deliberately published, active jobs on datasets that are themselves
 * public are visible outside the dataset's owners.
 */
export const listPublicJobs = async (): Promise<JobWithProgress[]> => {
  const publicDatasets = await datasets.datasetIdsFor(undefined, 'read');
  const jobs = await LabelJob.find({ status: 'active', isPublic: true, datasetId: { $in: publicDatasets } }).sort({ updatedAt: -1 });
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

/**
 * The job's dataset as its page shows it: name and owner. A dataset that is
 * gone or in the trash reads as nothing, rather than failing the page.
 */
export const jobDataset = async (job: ILabelJob): Promise<Pick<datasets.DatasetSummary, '_id' | 'name' | 'owner'> | undefined> => {
  if (!job.datasetId) return undefined;
  try {
    const { _id, name, owner } = await datasets.getDataset(job.datasetId);
    return { _id, name, owner };
  } catch (error) {
    if (error instanceof NotFoundError) return undefined;
    throw error;
  }
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
 * so three archived jobs over a 4k-frame dataset left 12,367 LabelTask documents
 * behind — each carrying a copy of its frame's selected mask metadata — with no
 * endpoint that could ever reach them. Deleting a job therefore deletes its
 * answers and tasks too; there is no soft-delete tier below this.
 *
 * Answers go first: an interrupted delete that has removed tasks but not answers
 * leaves answers pointing at nothing, while the reverse merely re-orphans tasks
 * a repeat call cleans up.
 */
export const deleteJob = async (jobId: string): Promise<{ tasks: number; answers: number }> => {
  // Release the dataset first: if that fails the job survives intact and the
  // delete can be retried, rather than leaving a claim nothing can release.
  const job = await LabelJob.findById(jobId);
  if (job?.datasetId) {
    await datasets.removeHold(job.datasetId, jobId);
    logger.info('Released dataset hold', { jobId, datasetId: job.datasetId });
  }
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

  // A job can never go live without a dataset, or without tasks.
  if (transition.to === 'active' && job.status === 'draft') {
    if (!job.datasetId) {
      throw new ConflictError('Job has no dataset');
    }
    if (job.tasksCount === 0) {
      throw new ConflictError('Job has no tasks — materialize first');
    }
  }

  job.status = transition.to;
  await job.save();
  return job;
};
