import { Types } from 'mongoose';
import { BadRequestError, ConflictError, NotFoundError, UserPayload } from '@visin/backend-core';
import { LabelTask, ILabelTask } from '../models/LabelTask';
import { LabelJob, ILabelJob } from '../models/LabelJob';
import { LabelAnswer, ILabelAnswer } from '../models/LabelAnswer';
import { LabelImage } from '../models/LabelImage';
import * as files from '../clients/fileServiceClient';
import { AnswerBody } from '../validation/taskSchemas';
import { getJobReadAccess } from './jobAccessService';
import { getJob } from './jobService';

const LEASE_MINUTES = Number(process.env.TASK_LEASE_MINUTES || 5);

export interface TaskImages {
  // `stem` is the frame's filename in the bundle — the name a labeler quotes
  // when asking a question about what they are looking at.
  frame: { url: string; width?: number; height?: number; stem?: string };
  layers: { set: string; url: string }[];
  idmap?: { url: string };
}

/** One answer's verdict, with no trace of who gave it. */
export interface AnswerSnapshot {
  choiceKey?: string;
  rejectedMaskIds?: number[];
  updatedAt: Date;
}

/**
 * What has already been decided about this frame.
 *
 * `latest` is deliberately anonymous: a visitor following a shared link should
 * see that a frame was labeled and how, without being handed the labelers'
 * email addresses. Service-managed labeler identity is omitted from this response.
 */
export interface TaskAnswerState {
  count: number;
  /** The caller's own answer, when they have one — what the workbench prefills. */
  mine: AnswerSnapshot | null;
  /** Most recently updated answer from anyone, for viewers with none of their own. */
  latest: AnswerSnapshot | null;
}

/** Where this frame sits in the job's frame order — 0-based. */
export interface TaskPosition {
  index: number;
  total: number;
}

/** Public task content; ownership, leases and persistence fields stay internal. */
export type TaskView = Pick<ILabelTask, '_id' | 'jobId' | 'labelImageId' | 'order' | 'stratum' | 'payload'>;

export interface TaskItem {
  task: TaskView;
  images: TaskImages;
  position: TaskPosition;
  answer: TaskAnswerState;
}

const buildTaskImages = async (task: ILabelTask): Promise<TaskImages> => {
  const imageIds: Types.ObjectId[] = [
    task.labelImageId,
    ...(task.payload?.layers?.map((layer) => layer.imageId) || []),
    ...(task.payload?.maskMap ? [task.payload.maskMap.imageId] : [])
  ];
  const images = await LabelImage.find({ _id: { $in: imageIds } });
  const byId = new Map(images.map((image) => [image._id.toString(), image]));

  const signFor = async (imageId: Types.ObjectId): Promise<string> => {
    const image = byId.get(imageId.toString());
    if (!image) {
      throw new NotFoundError('Task image missing from bundle');
    }
    return (await files.getDownloadUrl(image.fileId)).url;
  };

  const frame = byId.get(task.labelImageId.toString());
  return {
    frame: {
      url: await signFor(task.labelImageId),
      width: frame?.width,
      height: frame?.height,
      stem: frame?.stem
    },
    layers: await Promise.all(
      (task.payload?.layers || []).map(async (layer) => ({ set: layer.set, url: await signFor(layer.imageId) }))
    ),
    ...(task.payload?.maskMap ? { idmap: { url: await signFor(task.payload.maskMap.imageId) } } : {})
  };
};

const snapshotOf = (answer: ILabelAnswer): AnswerSnapshot => ({
  ...(answer.choiceKey ? { choiceKey: answer.choiceKey } : {}),
  ...(answer.rejectedMaskIds ? { rejectedMaskIds: answer.rejectedMaskIds } : {}),
  updatedAt: answer.updatedAt
});

// Bounded by the job's redundancy K (max 10), so reading the lot and picking in
// memory costs one indexed query rather than one per question asked of it.
const answerStateFor = async (taskId: Types.ObjectId, userId?: string): Promise<TaskAnswerState> => {
  const answers = await LabelAnswer.find({ taskId }).sort({ updatedAt: -1 });
  const mine = userId ? answers.find((answer) => answer.userId === userId) : undefined;
  return {
    count: answers.length,
    mine: mine ? snapshotOf(mine) : null,
    latest: answers[0] ? snapshotOf(answers[0]) : null
  };
};

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
  const [images, position, answer] = await Promise.all([
    buildTaskImages(task),
    positionFor(task, total),
    answerStateFor(task._id, userId)
  ]);
  // Construct an allowlist rather than serializing the document or deleting known
  // private fields: newly added model fields must not become public automatically.
  const view: TaskView = {
    _id: task._id,
    jobId: task.jobId,
    labelImageId: task.labelImageId,
    order: task.order,
    stratum: task.stratum,
    payload: task.payload
  };
  return { task: view, images, position, answer };
};

/**
 * Lease-based pull: atomically grab the first task this user hasn't answered,
 * that still needs answers (< K) and has no live lease held by someone else.
 * A task leased by the caller is eligible again (resume after refresh), so a
 * client holding tasks (the workbench prefetches one ahead) must pass their
 * ids in `excludeTaskIds` or it would be handed the same task twice.
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
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lt: now } }, { leasedBy: user.id }]
    },
    { $set: { leasedBy: user.id, leaseExpiresAt: new Date(now.getTime() + LEASE_MINUTES * 60 * 1000) } },
    { sort: { order: 1 }, new: true }
  );

  if (!task) {
    return null;
  }
  return buildTaskItem(task, user.id, job.tasksCount);
};

/**
 * One named task, images and all — what a shared workbench URL resolves to.
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
 * The frame at a 0-based position in the job's order — what the workbench's
 * prev/next stepping resolves to, and where an anonymous visitor starts.
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
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  return { task, job };
};

const validateAnswerForTaskType = (job: ILabelJob, task: ILabelTask, body: AnswerBody): void => {
  if (job.taskType === 'single_choice') {
    if (!body.choiceKey) {
      throw new BadRequestError('choiceKey required for a single_choice task');
    }
    const keys = (job.question.choices || []).map((choice) => choice.key);
    if (!keys.includes(body.choiceKey)) {
      throw new BadRequestError(`Unknown choiceKey "${body.choiceKey}"`);
    }
    return;
  }

  // mask_toggle: an empty list is a valid answer ("all masks correct").
  if (!body.rejectedMaskIds) {
    throw new BadRequestError('rejectedMaskIds required for a mask_toggle task');
  }
  const known = new Set((task.payload?.maskMap?.masks || []).map((mask) => mask.id));
  const unknown = body.rejectedMaskIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new BadRequestError(`Unknown mask ids: ${unknown.join(', ')}`);
  }
};

const maybeCompleteJob = async (job: ILabelJob): Promise<void> => {
  const remaining = await LabelTask.countDocuments({ jobId: job._id, answersCount: { $lt: job.redundancy } });
  if (remaining === 0) {
    await LabelJob.updateOne({ _id: job._id, status: 'active' }, { $set: { status: 'completed' } });
  }
};

/**
 * Record this user's verdict on a task, replacing their previous one if they
 * had already answered.
 *
 * Revising used to be a two-step undo-then-answer, which the workbench never
 * exposed outside the "undo the last thing I just did" button — so walking back
 * to a frame and correcting a mask meant deleting the answer first. A re-submit
 * now overwrites, and only a *first* answer moves the task's counters.
 */
export const submitAnswer = async (task: ILabelTask, job: ILabelJob, user: UserPayload, body: AnswerBody) => {
  const previous = await LabelAnswer.findOne({ taskId: task._id, userId: user.id });
  // A completed job stopped taking new answers by definition — every task
  // reached K. Revising one that is already counted doesn't change that, and
  // refusing it would make the frames that finished the job the only ones that
  // can never be corrected.
  if (job.status !== 'active' && !(previous && job.status === 'completed')) {
    throw new ConflictError(`Job is ${job.status}, not accepting answers`);
  }
  validateAnswerForTaskType(job, task, body);

  let existed: boolean;
  try {
    // `new: false` returns the pre-update document — null exactly when this
    // call inserted — so the counters below are bumped once, on the first
    // answer only, without a read that a concurrent submit could race.
    existed = Boolean(
      await LabelAnswer.findOneAndUpdate(
        { taskId: task._id, userId: user.id },
        {
          $set: {
            jobId: job._id,
            userEmail: (user.email || '').toLowerCase(),
            ...(user.name ? { userName: user.name } : {}),
            ...(body.choiceKey ? { choiceKey: body.choiceKey } : {}),
            ...(body.rejectedMaskIds ? { rejectedMaskIds: body.rejectedMaskIds } : {}),
            ...(body.elapsedMs != null ? { elapsedMs: body.elapsedMs } : {})
          }
        },
        { upsert: true, new: false }
      )
    );
  } catch (err) {
    // Two submits for the same task racing each other: both found nothing and
    // both tried to insert. The other one won and its answer is stored.
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError('Another submission for this task landed first — reload the frame');
    }
    throw err;
  }

  await LabelTask.updateOne(
    { _id: task._id },
    {
      ...(existed ? {} : { $inc: { answersCount: 1 }, $addToSet: { answeredBy: user.id } }),
      $unset: { leasedBy: '', leaseExpiresAt: '' }
    }
  );
  if (!existed) {
    await maybeCompleteJob(job);
  }
  return LabelAnswer.findOne({ taskId: task._id, userId: user.id });
};

/** Undo-last: remove the caller's own answer so the task can be answered again. */
export const undoAnswer = async (task: ILabelTask, job: ILabelJob, user: UserPayload): Promise<void> => {
  const deleted = await LabelAnswer.findOneAndDelete({ taskId: task._id, userId: user.id });
  if (!deleted) {
    throw new NotFoundError('No answer of yours on this task');
  }
  await LabelTask.updateOne(
    { _id: task._id },
    { $inc: { answersCount: -1 }, $pull: { answeredBy: user.id } }
  );
  // A completed job regains an open task.
  await LabelJob.updateOne({ _id: job._id, status: 'completed' }, { $set: { status: 'active' } });
};
