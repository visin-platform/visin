import { Types } from 'mongoose';
import { BadRequestError, ConflictError, UserPayload, logger } from '@visin/backend-core';
import { LabelTask, ILabelTask } from '../models/LabelTask';
import { LabelJob, ILabelJob, IJobClass } from '../models/LabelJob';
import { LabelAnnotation, ILabelAnnotation, IBoxObject } from '../models/LabelAnnotation';
import * as files from '../clients/fileServiceClient';
import { SaveAnnotationBody } from '../validation/taskSchemas';
import { decodeMaskRle, countPixels } from '../utils/mask';
import { encodeGrayscalePng } from '../utils/png';
import { taskSet } from './taskGeneration';

// The service's public surface stays here, whichever file a piece now lives in.
export * from './taskItem';

const identity = (user: UserPayload) => ({
  userEmail: (user.email || '').toLowerCase(),
  ...(user.name ? { userName: user.name } : {})
});

/**
 * Whether this caller may write labels on this task now.
 *
 * A completed job stopped handing out frames by definition — every task reached
 * K. Revising one that is already counted doesn't change that, and refusing it
 * would make the frames that finished the job the only ones that can never be
 * corrected.
 */
const assertWritable = (job: ILabelJob, previous: ILabelAnnotation | null): void => {
  if (job.lifecycle) throw new ConflictError('Job creation or deletion is still running');
  if (job.status === 'active' || (job.status === 'completed' && previous)) return;
  throw new ConflictError(`Job is ${job.status}, not accepting labels`);
};

const classFor = (job: ILabelJob, key: string): IJobClass => {
  const found = job.classes.find((candidate) => candidate.key === key);
  if (!found) {
    throw new BadRequestError(`Unknown class "${key}"`);
  }
  return found;
};

/** Boxes keep to the frame: an edge dragged past it is pulled back, and one wholly outside is dropped. */
export const clampBox = (
  bbox: IBoxObject['bbox'],
  width?: number,
  height?: number
): IBoxObject['bbox'] | null => {
  let [x, y, w, h] = bbox;
  if (width !== undefined && height !== undefined) {
    const x2 = Math.min(width, x + w);
    const y2 = Math.min(height, y + h);
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = x2 - x;
    h = y2 - y;
  }
  return w >= 1 && h >= 1 ? [x, y, w, h] : null;
};

const firstWrite = async <T>(attempt: () => Promise<T>): Promise<T> => {
  try {
    return await attempt();
  } catch (err) {
    // Two first saves for the same task racing: both found nothing and both tried
    // to insert. The retry takes the update path against the other one's row.
    if ((err as { code?: number }).code === 11000) return attempt();
    throw err;
  }
};

/**
 * The caller's annotation of this task, created as a draft if they have none.
 * Touching a skipped frame reopens it: whoever draws on it is no longer skipping.
 */
const ensureAnnotation = async (
  task: ILabelTask,
  job: ILabelJob,
  user: UserPayload,
  set: Record<string, unknown> = {}
): Promise<ILabelAnnotation> => {
  const previous = await LabelAnnotation.findOne({ taskId: task._id, userId: user.id });
  assertWritable(job, previous);
  const reopen = previous?.status === 'skipped';
  const annotation = await firstWrite(() =>
    LabelAnnotation.findOneAndUpdate(
      { taskId: task._id, userId: user.id },
      // `status` goes in one operator or the other, never both: MongoDB refuses an
      // update that names the same path in `$set` and `$setOnInsert`.
      reopen
        ? { $set: { jobId: job._id, ...(task.generation ? { generation: task.generation } : {}), ...identity(user), status: 'draft', ...set } }
        : { $set: { jobId: job._id, ...(task.generation ? { generation: task.generation } : {}), ...identity(user), ...set }, $setOnInsert: { status: 'draft' } },
      { upsert: true, returnDocument: 'after' }
    )
  );
  if (reopen) {
    await LabelTask.updateOne({ _id: task._id }, { $pull: { skippedBy: user.id } });
  }
  return annotation!;
};

/** Autosave of the boxes on a frame: the whole list, replacing what was there. */
export const saveObjects = async (
  task: ILabelTask,
  job: ILabelJob,
  user: UserPayload,
  body: SaveAnnotationBody
): Promise<ILabelAnnotation> => {
  const objects: IBoxObject[] = [];
  for (const object of body.objects) {
    if (!classFor(job, object.classKey).tools.includes('box')) {
      throw new BadRequestError(`"${object.classKey}" is not a box class`);
    }
    const bbox = clampBox(object.bbox, task.frame.width, task.frame.height);
    if (bbox) {
      objects.push({
        id: object.id,
        classKey: object.classKey,
        bbox,
        source: object.source,
        ...(object.score !== undefined ? { score: object.score } : {})
      });
    }
  }
  return ensureAnnotation(task, job, user, {
    objects,
    ...(body.elapsedMs !== undefined ? { elapsedMs: body.elapsedMs } : {})
  });
};

/**
 * Store the frame's mask: decode the editor's run-length upload, check it against
 * the frame and the job's classes, write it as a grayscale PNG and point the
 * annotation at it. The file it replaces is removed afterwards — each save is a
 * new file, so a failed upload can never leave a half-written mask behind.
 */
export const saveMask = async (
  task: ILabelTask,
  job: ILabelJob,
  user: UserPayload,
  upload: Buffer
): Promise<ILabelAnnotation> => {
  const raw = decodeMaskRle(upload);
  const { width, height } = task.frame;
  if (width !== undefined && height !== undefined && (raw.width !== width || raw.height !== height)) {
    throw new BadRequestError(`The mask is ${raw.width}×${raw.height} but the frame is ${width}×${height}`);
  }
  const pixels = countPixels(raw.data);
  const allowed = new Set(job.classes.filter((candidate) => candidate.tools.includes('mask')).map((c) => String(c.maskIndex)));
  const unknown = Object.keys(pixels).filter((index) => !allowed.has(index));
  if (unknown.length > 0) {
    throw new BadRequestError(`The mask uses values that are not mask classes of this job: ${unknown.join(', ')}`);
  }

  const annotation = await ensureAnnotation(task, job, user);
  const previousFileId = annotation.mask?.fileId;
  const fileId = `${files.jobFolder(job._id.toString())}masks/${annotation._id}-${Date.now().toString(36)}.png`;
  await files.putFile(fileId, encodeGrayscalePng(raw.width, raw.height, raw.data));

  const stored = await LabelAnnotation.findOneAndUpdate(
    { _id: annotation._id },
    { $set: { mask: { fileId, width: raw.width, height: raw.height, pixels } } },
    { returnDocument: 'after' }
  );
  if (previousFileId) {
    files.deleteFile(previousFileId).catch((error: Error) => {
      logger.warn('Could not remove a replaced mask file', { fileId: previousFileId, error: error.message });
    });
  }
  return stored!;
};

/** Remove the frame's mask — the editor cleared every painted pixel. */
export const clearMask = async (task: ILabelTask, job: ILabelJob, user: UserPayload): Promise<void> => {
  const annotation = await LabelAnnotation.findOne({ taskId: task._id, userId: user.id });
  if (!annotation?.mask) return;
  assertWritable(job, annotation);
  const { fileId } = annotation.mask;
  await LabelAnnotation.updateOne({ _id: annotation._id }, { $unset: { mask: '' } });
  await files.deleteFile(fileId).catch((error: Error) => {
    logger.warn('Could not remove a cleared mask file', { fileId, error: error.message });
  });
};

export const maybeCompleteJob = async (job: ILabelJob): Promise<void> => {
  const remaining = await LabelTask.countDocuments({ ...taskSet(job), answersCount: { $lt: job.redundancy } });
  if (remaining === 0) {
    await LabelJob.updateOne({ _id: job._id, status: 'active' }, { $set: { status: 'completed' } });
  }
};

/** Count an annotator once, including concurrent requests and retries after a partial write. */
export const recordTaskCompletion = async (taskId: Types.ObjectId, userId: string): Promise<boolean> => {
  const cleanup = { $pull: { skippedBy: userId }, $unset: { leasedBy: '', leaseExpiresAt: '' } };
  const result = await LabelTask.updateOne(
    { _id: taskId, answeredBy: { $ne: userId } },
    { $inc: { answersCount: 1 }, $addToSet: { answeredBy: userId }, ...cleanup }
  );
  if (result.modifiedCount > 0) return true;
  await LabelTask.updateOne({ _id: taskId }, cleanup);
  return false;
};

/**
 * Close the frame for this annotator: `done` counts toward the job, `skip` only
 * stops it being offered to them again (someone else may still label it).
 *
 * Only a *first* done moves the task's counters, so finishing a frame again
 * after walking back to it changes nothing but the labels.
 */
export const finishTask = async (
  task: ILabelTask,
  job: ILabelJob,
  user: UserPayload,
  outcome: 'done' | 'skipped',
  elapsedMs?: number
): Promise<ILabelAnnotation> => {
  const previous = await LabelAnnotation.findOne({ taskId: task._id, userId: user.id });
  assertWritable(job, previous);
  if (outcome === 'skipped' && previous?.status === 'done') {
    throw new ConflictError('This frame is already done');
  }

  const annotation = await firstWrite(() =>
    LabelAnnotation.findOneAndUpdate(
      { taskId: task._id, userId: user.id },
      {
        $set: {
          jobId: job._id,
          ...(task.generation ? { generation: task.generation } : {}),
          ...identity(user),
          status: outcome,
          ...(outcome === 'done' ? { doneAt: new Date() } : {}),
          ...(elapsedMs !== undefined ? { elapsedMs } : {})
        }
      },
      { upsert: true, returnDocument: 'after' }
    )
  );

  const newlyDone = outcome === 'done' && await recordTaskCompletion(task._id, user.id);
  if (outcome === 'skipped') {
    await LabelTask.updateOne(
      { _id: task._id },
      { $addToSet: { skippedBy: user.id }, $unset: { leasedBy: '', leaseExpiresAt: '' } }
    );
  }
  if (newlyDone) {
    await maybeCompleteJob(job);
  }
  return annotation!;
};
