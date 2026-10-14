import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, logger } from '@visin/backend-core';
import { LabelJob, type ILabelJob } from '../models/LabelJob';
import { LabelTask } from '../models/LabelTask';
import { LabelAnnotation } from '../models/LabelAnnotation';
import { LabelSuggestion } from '../models/LabelSuggestion';
import * as datasets from '../clients/datasetServiceClient';
import * as files from '../clients/fileServiceClient';

// Longer than the bounded remote calls; a crashed process becomes recoverable.
export const LIFECYCLE_LEASE_MS = 10 * 60_000;
export const READY_JOB = { lifecycle: { $exists: false } } as const;

export const newLifecycleLease = (now = new Date()) => ({
  lifecycleToken: randomUUID(),
  lifecycleLeaseUntil: new Date(now.getTime() + LIFECYCLE_LEASE_MS)
});

const owned = (job: ILabelJob) => ({ _id: job._id, lifecycle: job.lifecycle, lifecycleToken: job.lifecycleToken });

/** Release only our lease: a newer recovery attempt must keep its ownership. */
export async function releaseLifecycleLease(job: ILabelJob): Promise<void> {
  await LabelJob.updateOne({ _id: job._id, lifecycleToken: job.lifecycleToken }, {
    $unset: { lifecycleToken: '' }, $set: { lifecycleLeaseUntil: new Date(0) }
  });
}

async function renew(job: ILabelJob): Promise<void> {
  const result = await LabelJob.updateOne(owned(job), {
    $set: { lifecycleLeaseUntil: new Date(Date.now() + LIFECYCLE_LEASE_MS) }
  });
  if (result.matchedCount === 0) throw new ConflictError('Job recovery is already running');
}

export interface RemovedJob {
  tasks: number;
  annotations: number;
  suggestions: number;
}

/** Keep the durable deletion intent and its dataset hold until no tasks remain. */
export async function finishJobDeletion(job: ILabelJob): Promise<RemovedJob> {
  const jobId = job._id.toString();
  await renew(job);
  await files.deleteFolder(files.jobFolder(jobId));
  const annotations = await LabelAnnotation.deleteMany({ jobId });
  const suggestions = await LabelSuggestion.deleteMany({ jobId });
  const tasks = await LabelTask.deleteMany({ jobId });
  await renew(job);
  if (job.datasetId) {
    try {
      await datasets.removeHold(job.datasetId, jobId);
    } catch (error) {
      // An already purged dataset has no hold to release. Other failures must
      // retain the intent, including a lost ACK after a successful release.
      if (!(error instanceof NotFoundError)) throw error;
    }
  }
  await LabelJob.deleteOne(owned(job));
  return {
    tasks: tasks.deletedCount || 0,
    annotations: annotations.deletedCount || 0,
    suggestions: suggestions.deletedCount || 0
  };
}

/** Retry the same hold reference after uncertain delivery, never discard its owner. */
export async function finishJobCreation(job: ILabelJob): Promise<ILabelJob> {
  await renew(job);
  try {
    await datasets.addHold(job.datasetId!, job._id.toString());
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError) {
      const deleting = await LabelJob.findOneAndUpdate(owned(job), { $set: { lifecycle: 'deleting' } }, { returnDocument: 'after' });
      if (deleting) {
        // The refusal is what the caller can act on. A cleanup that fails stays
        // a durable deletion intent, which recovery retries.
        await finishJobDeletion(deleting).catch((cleanupError: Error) =>
          logger.warn('Refused job creation cleanup failed; will retry', { jobId: job._id.toString(), error: cleanupError.message })
        );
      }
    }
    throw error;
  }
  const ready = await LabelJob.findOneAndUpdate(owned(job), {
    $unset: { lifecycle: '', lifecycleToken: '', lifecycleLeaseUntil: '' }
  }, { returnDocument: 'after' });
  if (!ready) throw new ConflictError('Job recovery is already running');
  return ready;
}

const availableLease = (now: Date) => ({
  $or: [{ lifecycleLeaseUntil: { $exists: false } }, { lifecycleLeaseUntil: { $lte: now } }]
});

/** Claim before destructive work so retries and recovery cannot process it together. */
export async function beginJobDeletion(jobId: string): Promise<ILabelJob | null> {
  const job = await LabelJob.findOneAndUpdate(
    { _id: jobId, lifecycle: { $ne: 'creating' }, materialization: { $exists: false }, ...availableLease(new Date()) },
    { $set: { lifecycle: 'deleting', ...newLifecycleLease() } },
    { returnDocument: 'after' }
  );
  if (!job && await LabelJob.exists({ _id: jobId })) throw new ConflictError('Job creation, task materialization or deletion is already running');
  return job;
}

/** Bounded-memory sweep; one unavailable dependency must not stop other jobs. */
export async function recoverJobLifecycles(now = new Date()): Promise<number> {
  const pending = LabelJob.find({ lifecycle: { $in: ['creating', 'deleting'] }, ...availableLease(now) }).cursor();
  let recovered = 0;
  for await (const candidate of pending) {
    const job = await LabelJob.findOneAndUpdate(
      { _id: candidate._id, lifecycle: candidate.lifecycle, ...availableLease(now) },
      { $set: newLifecycleLease(now) }, { returnDocument: 'after' }
    );
    if (!job) continue;
    try {
      if (job.lifecycle === 'creating') await finishJobCreation(job);
      else await finishJobDeletion(job);
      recovered++;
    } catch (error) {
      await releaseLifecycleLease(job);
      logger.warn('Job lifecycle recovery failed; will retry', { jobId: job._id.toString(), error: (error as Error).message });
    }
  }
  return recovered;
}
