import { Types } from 'mongoose';
import { BadRequestError, ConflictError, NotFoundError, UserPayload, logger } from '@visin/backend-core';
import { LabelTask, ILabelTask, ITaskPoint } from '../models/LabelTask';
import { LabelJob, ILabelJob, IJobClass } from '../models/LabelJob';
import { LabelAnnotation, ILabelAnnotation, IAnnotationMask, IBoxObject } from '../models/LabelAnnotation';
import { LabelSuggestion } from '../models/LabelSuggestion';
import * as files from '../clients/fileServiceClient';
import { SaveAnnotationBody } from '../validation/taskSchemas';
import { decodeMaskRle, countPixels } from '../utils/mask';
import { encodeGrayscalePng } from '../utils/png';
import { TASK_LEASE_MINUTES } from '../limits';
import { getJobReadAccess } from './jobAccessService';
import { getJob } from './jobService';


export type SensorView =
  | { key: string; kind: 'image'; url: string }
  | { key: string; kind: 'points'; points: ITaskPoint[] };

export interface TaskImages {
  // `stem` is the frame's filename in the dataset — the name a labeler quotes
  // when asking a question about what they are looking at.
  frame: { url: string; width?: number; height?: number; stem?: string };
  sensors: SensorView[];
}

export interface MaskView {
  url: string;
  width: number;
  height: number;
}

/** One annotator's labels on a frame, with no trace of who made them. */
export interface AnnotationView {
  status: 'draft' | 'done' | 'skipped';
  objects: IBoxObject[];
  mask?: MaskView;
  updatedAt: Date;
}

/** Labels that came with an import: shown dashed until an annotator accepts them. */
export interface SuggestionView {
  objects: IBoxObject[];
  mask?: MaskView;
}

/**
 * What has already been labeled on this frame.
 *
 * `latest` is deliberately anonymous: a visitor following a shared link should
 * see that a frame was labeled and how, without being handed the annotators'
 * email addresses. Service-managed identity is omitted from this response.
 */
export interface TaskAnnotationState {
  /** annotators who finished the frame */
  count: number;
  /** The caller's own labels, when they have any — what the editor opens with. */
  mine: AnnotationView | null;
  /** The most recently finished labels from anyone, shown to a viewer with none of their own. */
  latest: AnnotationView | null;
}

/** Where this frame sits in the job's frame order — 0-based. */
export interface TaskPosition {
  index: number;
  total: number;
}

/**
 * Public task content. Ownership, leases and storage file ids stay internal: the
 * client gets signed URLs in `images`, and from the sensors only what it acts on.
 */
export interface TaskView {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  order: number;
  stratum?: string;
  sensors?: { key: string; kind: string }[];
}

export interface TaskItem {
  task: TaskView;
  images: TaskImages;
  position: TaskPosition;
  annotation: TaskAnnotationState;
  /** present for a signed-in caller with no labels of their own on the frame */
  suggestions: SuggestionView | null;
}

const toObjects = (objects: IBoxObject[]): IBoxObject[] =>
  objects.map((object) => ({
    id: object.id,
    classKey: object.classKey,
    bbox: [...object.bbox] as IBoxObject['bbox'],
    source: object.source,
    ...(object.score !== undefined ? { score: object.score } : {})
  }));

/**
 * `total` is passed in wherever the caller already holds the job, whose
 * denormalized `tasksCount` is the same number — the pull path runs on every
 * frame a labeler sees and shouldn't pay for a count it was handed.
 */
const positionFor = async (task: ILabelTask, total?: number): Promise<TaskPosition> => {
  const [index, resolvedTotal] = await Promise.all([
    LabelTask.countDocuments({ jobId: task.jobId, order: { $lt: task.order } }),
    total != null ? Promise.resolve(total) : LabelTask.countDocuments({ jobId: task.jobId })
  ]);
  return { index, total: resolvedTotal };
};

const buildTaskItem = async (task: ILabelTask, userId?: string, total?: number): Promise<TaskItem> => {
  // Bounded by the job's redundancy K (max 10) per frame, so reading the lot and
  // picking in memory costs one indexed query rather than one per question.
  const [annotations, position, suggestionDoc] = await Promise.all([
    LabelAnnotation.find({ taskId: task._id }).sort({ updatedAt: -1 }),
    positionFor(task, total),
    userId ? LabelSuggestion.findOne({ taskId: task._id }) : Promise.resolve(null)
  ]);
  const mine = userId ? annotations.find((annotation) => annotation.userId === userId) : undefined;
  const finished = annotations.filter((annotation) => annotation.status === 'done');
  const latest = finished[0];
  const suggestion = mine ? null : suggestionDoc;

  const sensors = task.sensors || [];
  const maskFiles = [mine?.mask?.fileId, latest?.mask?.fileId, suggestion?.mask?.fileId].filter(
    (fileId): fileId is string => Boolean(fileId)
  );
  const urls = await files.getDownloadUrls([
    task.frame.fileId,
    ...sensors.flatMap((sensor) => (sensor.fileId ? [sensor.fileId] : [])),
    ...maskFiles
  ]);
  const urlFor = (fileId: string): string => {
    const url = urls[fileId];
    if (!url) {
      throw new NotFoundError('Task image could not be signed');
    }
    return url;
  };
  const maskView = (mask?: IAnnotationMask): MaskView | undefined =>
    mask ? { url: urlFor(mask.fileId), width: mask.width, height: mask.height } : undefined;
  const annotationView = (annotation: ILabelAnnotation): AnnotationView => {
    const mask = maskView(annotation.mask);
    return {
      status: annotation.status,
      objects: toObjects(annotation.objects),
      ...(mask ? { mask } : {}),
      updatedAt: annotation.updatedAt
    };
  };

  // Construct an allowlist rather than serializing the document or deleting known
  // private fields: newly added model fields must not become public automatically.
  const view: TaskView = {
    _id: task._id,
    jobId: task.jobId,
    order: task.order,
    stratum: task.stratum,
    ...(sensors.length ? { sensors: sensors.map((sensor) => ({ key: sensor.key, kind: sensor.kind })) } : {})
  };
  const suggestionMask = maskView(suggestion?.mask);
  return {
    task: view,
    images: {
      frame: {
        url: urlFor(task.frame.fileId),
        width: task.frame.width,
        height: task.frame.height,
        stem: task.frame.stem
      },
      sensors: sensors.map((sensor): SensorView =>
        sensor.kind === 'points'
          ? { key: sensor.key, kind: 'points', points: sensor.points || [] }
          : { key: sensor.key, kind: 'image', url: urlFor(sensor.fileId!) }
      )
    },
    position,
    annotation: {
      count: finished.length,
      mine: mine ? annotationView(mine) : null,
      latest: latest ? annotationView(latest) : null
    },
    suggestions: suggestion
      ? { objects: toObjects(suggestion.objects), ...(suggestionMask ? { mask: suggestionMask } : {}) }
      : null
  };
};

/**
 * Lease-based pull: atomically grab the first task this user hasn't finished or
 * skipped, that still needs labels (< K) and has no live lease held by someone
 * else. A task leased by the caller is eligible again (resume after refresh), so
 * a client holding tasks (the editor prefetches one ahead) must pass their ids
 * in `excludeTaskIds` or it would be handed the same task twice.
 * Returns null when the user is done with this job.
 */
export const nextTask = async (
  job: ILabelJob,
  user: UserPayload,
  excludeTaskIds: string[] = []
): Promise<TaskItem | null> => {
  const now = new Date();
  const task = await LabelTask.findOneAndUpdate(
    {
      jobId: job._id,
      ...(excludeTaskIds.length ? { _id: { $nin: excludeTaskIds } } : {}),
      answersCount: { $lt: job.redundancy },
      answeredBy: { $ne: user.id },
      skippedBy: { $ne: user.id },
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lt: now } }, { leasedBy: user.id }]
    },
    { $set: { leasedBy: user.id, leaseExpiresAt: new Date(now.getTime() + TASK_LEASE_MINUTES * 60 * 1000) } },
    { sort: { order: 1 }, returnDocument: 'after' }
  );

  if (!task) {
    return null;
  }
  return buildTaskItem(task, user.id, job.tasksCount);
};

/**
 * One named task, images and all — what a shared editor URL resolves to.
 *
 * Deliberately does not take a lease: opening someone else's link is a look at
 * a specific frame, not a claim on it, and leasing here would pull the task out
 * of the queue for whoever was about to be handed it.
 */
export const getTaskItem = async (taskId: string, userId?: string): Promise<TaskItem> => {
  const { task, job } = await getTaskWithJob(taskId);
  await getJobReadAccess(job, userId);
  return buildTaskItem(task, userId);
};

/**
 * The frame at a 0-based position in the job's order — what the editor's
 * back/forward stepping resolves to, and where an anonymous visitor starts.
 *
 * Out of range returns null rather than 404: the client walks to `index + 1`
 * without knowing whether it exists, and "you have reached the end" is not an
 * error worth an error response.
 */
export const getTaskItemAtIndex = async (
  jobId: string,
  index: number,
  userId?: string
): Promise<TaskItem | null> => {
  const job = await getJob(jobId);
  await getJobReadAccess(job, userId);
  const task = await LabelTask.findOne({ jobId }).sort({ order: 1 }).skip(index);
  return task ? buildTaskItem(task, userId) : null;
};

export const getTaskWithJob = async (taskId: string): Promise<{ task: ILabelTask; job: ILabelJob }> => {
  const task = await LabelTask.findById(taskId);
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  const job = await LabelJob.findById(task.jobId);
  if (!job || job.lifecycle) {
    throw new NotFoundError('Job not found');
  }
  return { task, job };
};

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
        ? { $set: { jobId: job._id, ...identity(user), status: 'draft', ...set } }
        : { $set: { jobId: job._id, ...identity(user), ...set }, $setOnInsert: { status: 'draft' } },
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
  const remaining = await LabelTask.countDocuments({ jobId: job._id, answersCount: { $lt: job.redundancy } });
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
