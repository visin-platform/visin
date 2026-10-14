import { randomUUID } from 'node:crypto';
import { ConflictError, logger } from '@visin/backend-core';
import { LabelJob, type ILabelJob, type IJobSelection } from '../models/LabelJob';
import { LabelTask } from '../models/LabelTask';
import { LabelAnnotation, type IAnnotationMask } from '../models/LabelAnnotation';
import { LabelSuggestion } from '../models/LabelSuggestion';
import * as files from '../clients/fileServiceClient';

export const TASK_BATCH_SIZE = 100;
export const MATERIALIZATION_LEASE_MS = 10 * 60_000;

const stageOwner = (job: ILabelJob, generation: string) => ({
  _id: job._id, status: 'draft' as const, lifecycle: { $exists: false },
  taskGeneration: job.taskGeneration ?? null, 'materialization.generation': generation
});
const changed = () => new ConflictError('The job changed or task materialization is already running. Reload and try again.');

export async function beginTaskSet(job: ILabelJob): Promise<string> {
  const generation = randomUUID();
  const claimed = await LabelJob.updateOne({
    _id: job._id, status: 'draft', lifecycle: { $exists: false },
    taskGeneration: job.taskGeneration ?? null, materialization: { $exists: false }
  }, { $set: { materialization: { generation, leaseUntil: new Date(Date.now() + MATERIALIZATION_LEASE_MS) } } });
  if (!claimed.matchedCount) throw changed();
  return generation;
}

export async function renewTaskSet(job: ILabelJob, generation: string): Promise<void> {
  const renewed = await LabelJob.updateOne(stageOwner(job, generation), {
    $set: { 'materialization.leaseUntil': new Date(Date.now() + MATERIALIZATION_LEASE_MS) }
  });
  if (!renewed.matchedCount) throw changed();
}

export async function publishTaskSet(job: ILabelJob, generation: string, tasksCount: number, selection: IJobSelection): Promise<void> {
  const published = await LabelJob.updateOne(stageOwner(job, generation), {
    $set: { taskGeneration: generation, tasksCount, selection }, $unset: { materialization: '' }
  });
  if (!published.matchedCount) throw changed();
  job.taskGeneration = generation;
  job.tasksCount = tasksCount;
  job.selection = selection;
}

/** Release only this build. A lost publication ACK must not erase its task set. */
export async function abandonTaskSet(job: ILabelJob, generation: string): Promise<void> {
  await LabelJob.updateOne({ _id: job._id, 'materialization.generation': generation }, { $unset: { materialization: '' } });
}

async function removeLabels(
  labels: AsyncIterable<{ _id: ILabelJob['_id']; mask?: IAnnotationMask }>,
  remove: (id: ILabelJob['_id']) => PromiseLike<unknown>
): Promise<void> {
  for await (const label of labels) {
    if (label.mask) await files.deleteFile(label.mask.fileId);
    await remove(label._id);
  }
}

/** Generation IDs are never reused. A retired set cannot become current again. */
async function removeRetiredSet(jobId: ILabelJob['_id'], generation: string | null): Promise<boolean> {
  const job = await LabelJob.findById(jobId);
  if (job && ((job.taskGeneration ?? null) === generation || job.materialization?.generation === generation)) return false;
  const filter = { jobId, generation };
  // Keep a file's owning row until its deletion succeeds, making cleanup retryable.
  await removeLabels(LabelAnnotation.find(filter).select('mask').cursor(), (id) => LabelAnnotation.deleteOne({ _id: id }));
  await removeLabels(LabelSuggestion.find(filter).select('mask').cursor(), (id) => LabelSuggestion.deleteOne({ _id: id }));
  await LabelTask.deleteMany(filter);
  return true;
}

/** Discover retired sets even after a crash or a late write from an expired build. */
export async function recoverTaskSets(now = new Date()): Promise<number> {
  await LabelJob.updateMany({ 'materialization.leaseUntil': { $lte: now } }, { $unset: { materialization: '' } });
  const project = { $project: { jobId: 1, generation: { $ifNull: ['$generation', null] } } };
  const sets = LabelTask.aggregate<{ _id: { jobId: ILabelJob['_id']; generation: string | null } }>([
    project,
    { $unionWith: { coll: 'label_annotations', pipeline: [project] } },
    { $unionWith: { coll: 'label_suggestions', pipeline: [project] } },
    { $group: { _id: { jobId: '$jobId', generation: '$generation' } } }
  ]).allowDiskUse(true).cursor();
  let removed = 0;
  for await (const set of sets) {
    try {
      if (await removeRetiredSet(set._id.jobId, set._id.generation)) removed++;
    } catch (error) {
      logger.warn('Retired task cleanup failed; will retry', { jobId: set._id.jobId.toString(), generation: set._id.generation, error: (error as Error).message });
    }
  }
  return removed;
}
