import { Types } from 'mongoose';
import { atLeast, BadRequestError, ConflictError, ForbiddenError, NotFoundError, UserPayload } from '@visin/backend-core';
import { LabelJob, ILabelJob, IJobClass, JobStatus, MAX_CLASSES } from '../models/LabelJob';
import { LabelTask } from '../models/LabelTask';
import { LabelAnnotation } from '../models/LabelAnnotation';
import { ClassInput, CreateJobBody, ModelClassMappingBody } from '../validation/jobSchemas';
import * as datasets from '../clients/datasetServiceClient';
import { beginJobDeletion, finishJobCreation, finishJobDeletion, newLifecycleLease, READY_JOB, releaseLifecycleLease, type RemovedJob } from './jobLifecycleService';

/**
 * The colours a new class is given in turn. The first eight are the charts'
 * series colours, which the fronts re-draw as their dark-scheme steps; the
 * annotator never has to pick one, and the manager can change any of them.
 */
const CLASS_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948',
  '#00a3c4', '#b04fd0', '#7a8c00', '#a65d3a'
];

const slug = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Change detector names on existing classes, preserving their keys, mask values and geometry. */
export const setModelClassMapping = async (job: ILabelJob, mapping: ModelClassMappingBody['mapping']): Promise<ILabelJob> => {
  const filter: Record<string, unknown> = { _id: job._id, ...READY_JOB };
  const set: Record<string, string> = {};
  const unset: Record<string, string> = {};
  for (const [key, name] of Object.entries(mapping)) {
    const index = job.classes.findIndex((entry) => entry.key === key);
    if (index < 0) throw new BadRequestError(`"${key}" is not a class of this job`);
    filter[`classes.${index}.key`] = key;
    if (name === null) unset[`classes.${index}.modelClass`] = '';
    else set[`classes.${index}.modelClass`] = name;
  }
  const names = job.classes.flatMap((entry) => {
    const name = Object.prototype.hasOwnProperty.call(mapping, entry.key) ? mapping[entry.key] : entry.modelClass;
    return name && entry.tools.includes('box') ? [name.trim().toLowerCase().replace(/[\s_-]+/g, ' ')] : [];
  });
  if (new Set(names).size !== names.length) throw new BadRequestError('A model class can map to only one job box class');
  const updated = await LabelJob.findOneAndUpdate(filter, {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {})
  }, { returnDocument: 'after', runValidators: true });
  if (!updated) throw new ConflictError('The job classes changed. Reload and try again.');
  return updated;
};

/**
 * Turn the classes a wizard (or an import) sends into stored ones: a unique key,
 * a colour, a hotkey, and the mask value each gets. The value is its position
 * and is never renumbered, so a mask written today still reads the same when
 * classes are added later.
 */
export const buildClasses = (inputs: ClassInput[], existing: IJobClass[] = []): IJobClass[] => {
  if (existing.length + inputs.length > MAX_CLASSES) {
    throw new BadRequestError(`A job can have at most ${MAX_CLASSES} classes`);
  }
  const taken = new Set(existing.map((entry) => entry.key));
  const hotkeys = new Set(existing.map((entry) => entry.hotkey).filter(Boolean));
  const built: IJobClass[] = [];
  for (const input of inputs) {
    let key = input.key || slug(input.name) || 'class';
    if (input.key && taken.has(key)) {
      throw new BadRequestError(`Two classes use the key "${key}"`);
    }
    for (let n = 2; taken.has(key); n++) {
      key = `${(input.key || slug(input.name) || 'class').slice(0, 36)}-${n}`;
    }
    taken.add(key);

    const position = existing.length + built.length;
    let hotkey = input.hotkey;
    if (!hotkey && position < 9 && !hotkeys.has(String(position + 1))) hotkey = String(position + 1);
    if (hotkey) hotkeys.add(hotkey);

    built.push({
      key,
      name: input.name,
      color: input.color || CLASS_COLORS[position % CLASS_COLORS.length],
      ...(hotkey ? { hotkey } : {}),
      tools: input.tools,
      maskIndex: position + 1,
      ...(input.modelClass ? { modelClass: input.modelClass } : {})
    });
  }
  if (new Set(inputs.map((input) => input.name.toLowerCase())).size !== inputs.length) {
    throw new BadRequestError('Two classes have the same name');
  }
  return built;
};

/**
 * Create a draft job on a dataset the caller manages, and claim the dataset so
 * the files its tasks will show cannot be deleted or re-imported from under it.
 *
 * The job has no owner of its own: it follows its dataset. The claim is made
 * after a durable creation intent exists (it names the job). Only a confirmed
 * claim makes it usable; uncertain delivery is retried by lifecycle recovery.
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
  const unknown = data.sensors.map((sensor) => sensor.group).filter((name) => !groupNames.includes(name));
  if (unknown.length > 0) {
    throw new BadRequestError(`Not image groups of this dataset: ${[...new Set(unknown)].join(', ')}`);
  }
  const job = await LabelJob.create({
    ...data,
    classes: buildClasses(data.classes),
    createdBy: {
      userId: user.id,
      email: (user.email || '').toLowerCase(),
      name: user.name
    },
    status: 'draft',
    lifecycle: 'creating',
    ...newLifecycleLease(),
    isPublic: false
  });
  try {
    return await finishJobCreation(job);
  } catch (err) {
    await releaseLifecycleLease(job);
    throw err;
  }
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
          ...READY_JOB,
          $or: [{ datasetId: { $in: datasetIds } }, { datasetId: { $exists: false }, 'createdBy.userId': userId }]
        }).sort({ updatedAt: -1 })
      : await LabelJob.find({ ...READY_JOB, datasetId: { $in: datasetIds }, status: 'active' }).sort({ updatedAt: -1 });

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
  const jobs = await LabelJob.find({ ...READY_JOB, status: 'active', isPublic: true, datasetId: { $in: publicDatasets } }).sort({ updatedAt: -1 });
  const progress = await progressForJobs(jobs, '');
  return jobs.map((job) => ({
    ...withoutCreatorIdentity(job),
    progress: progress.get(job._id.toString())!
  }));
};

export const getJob = async (jobId: string, forDeletion = false): Promise<ILabelJob> => {
  const job = await LabelJob.findById(jobId);
  if (!job || (job.lifecycle && !forDeletion)) {
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
  const job = await LabelJob.findOneAndUpdate({ _id: jobId, ...READY_JOB }, { $set: { isPublic } }, { returnDocument: 'after' });
  if (!job) throw new NotFoundError('Job not found');
  return job;
};

export interface JobProgress {
  tasks: number;
  completed: number; // tasks that reached redundancy K
  done: number; // frames annotators finished (K per task when redundant)
  skipped: number;
  myDone: number;
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
    jobs.map((job) => [job._id.toString(), { tasks: 0, completed: 0, done: 0, skipped: 0, myDone: 0 }])
  );
  if (byJob.size === 0) {
    return byJob;
  }

  const jobIds = jobs.map((job) => job._id);
  const [taskBuckets, annotationRows] = await Promise.all([
    LabelTask.aggregate<{ _id: { jobId: Types.ObjectId; answersCount: number }; count: number }>([
      { $match: { jobId: { $in: jobIds } } },
      { $group: { _id: { jobId: '$jobId', answersCount: '$answersCount' }, count: { $sum: 1 } } }
    ]),
    LabelAnnotation.aggregate<{ _id: Types.ObjectId; done: number; skipped: number; myDone: number }>([
      { $match: { jobId: { $in: jobIds }, status: { $in: ['done', 'skipped'] } } },
      {
        $group: {
          _id: '$jobId',
          done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          skipped: { $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] } },
          myDone: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'done'] }, { $eq: ['$userId', userId] }] }, 1, 0] } }
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
  for (const row of annotationRows) {
    const progress = byJob.get(row._id.toString());
    if (progress) {
      progress.done = row.done;
      progress.skipped = row.skipped;
      progress.myDone = row.myDone;
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
 * `archive` is a status, not a removal: an archived job kept its whole task set
 * with no endpoint that could ever reach it. Deleting a job therefore deletes its
 * annotations, suggestions, mask files and tasks too; there is no soft-delete
 * tier below this.
 *
 * A durable intent hides it before cleanup. The dataset claim is released only
 * after tasks are gone; every failed stage remains available for recovery.
 */
export const deleteJob = async (
  jobId: string
): Promise<RemovedJob> => {
  const job = await beginJobDeletion(jobId);
  if (!job) return { tasks: 0, annotations: 0, suggestions: 0 };
  try {
    return await finishJobDeletion(job);
  } catch (error) {
    await releaseLifecycleLease(job);
    throw error;
  }
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

  const updated = await LabelJob.findOneAndUpdate(
    { _id: job._id, ...READY_JOB, status: job.status, tasksCount: job.tasksCount },
    { $set: { status: transition.to } }, { returnDocument: 'after' }
  );
  if (!updated) throw new ConflictError('Job changed. Reload and try again.');
  return updated;
};
