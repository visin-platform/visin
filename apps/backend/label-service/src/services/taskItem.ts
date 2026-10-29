import { Types } from 'mongoose';
import { NotFoundError, UserPayload } from '@visin/backend-core';
import { LabelTask, ILabelTask, ITaskPoint } from '../models/LabelTask';
import { LabelJob, ILabelJob } from '../models/LabelJob';
import { LabelAnnotation, ILabelAnnotation, IAnnotationMask, IBoxObject } from '../models/LabelAnnotation';
import { LabelSuggestion } from '../models/LabelSuggestion';
import * as files from '../clients/fileServiceClient';
import { TASK_LEASE_MINUTES } from '../limits';
import { getJobReadAccess } from './jobAccessService';
import { getJob } from './jobService';
import { taskSet } from './taskGeneration';

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
  const filter = { jobId: task.jobId, generation: task.generation ?? null };
  const [index, resolvedTotal] = await Promise.all([
    LabelTask.countDocuments({ ...filter, order: { $lt: task.order } }),
    total != null ? Promise.resolve(total) : LabelTask.countDocuments(filter)
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
      ...taskSet(job),
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
  const task = await LabelTask.findOne(taskSet(job)).sort({ order: 1 }).skip(index);
  return task ? buildTaskItem(task, userId) : null;
};

export const getTaskWithJob = async (taskId: string): Promise<{ task: ILabelTask; job: ILabelJob }> => {
  const task = await LabelTask.findById(taskId);
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  const job = await LabelJob.findById(task.jobId);
  if (!job || job.lifecycle || (task.generation ?? null) !== (job.taskGeneration ?? null)) {
    throw new NotFoundError('Job not found');
  }
  return { task, job };
};
