import { Types } from 'mongoose';
import { BadRequestError, ConflictError, NotFoundError, UserPayload } from '@visin/backend-core';
import { LabelTask, ILabelTask } from '../models/LabelTask';
import { LabelJob, ILabelJob } from '../models/LabelJob';
import { LabelAnswer } from '../models/LabelAnswer';
import { LabelImage } from '../models/LabelImage';
import * as files from '../clients/fileServiceClient';
import { AnswerBody } from '../validation/taskSchemas';

const LEASE_MINUTES = Number(process.env.TASK_LEASE_MINUTES || 5);

export interface TaskImages {
  frame: { url: string; width?: number; height?: number };
  layers: { set: string; url: string }[];
  idmap?: { url: string };
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
    frame: { url: await signFor(task.labelImageId), width: frame?.width, height: frame?.height },
    layers: await Promise.all(
      (task.payload?.layers || []).map(async (layer) => ({ set: layer.set, url: await signFor(layer.imageId) }))
    ),
    ...(task.payload?.maskMap ? { idmap: { url: await signFor(task.payload.maskMap.imageId) } } : {})
  };
};

/**
 * Lease-based pull: atomically grab the first task this user hasn't answered,
 * that still needs answers (< K) and has no live lease held by someone else.
 * Returns null when the user is done with this job.
 */
export const nextTask = async (
  job: ILabelJob,
  user: UserPayload
): Promise<{ task: ILabelTask; images: TaskImages } | null> => {
  const now = new Date();
  const task = await LabelTask.findOneAndUpdate(
    {
      jobId: job._id,
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
  return { task, images: await buildTaskImages(task) };
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

export const submitAnswer = async (task: ILabelTask, job: ILabelJob, user: UserPayload, body: AnswerBody) => {
  if (job.status !== 'active') {
    throw new ConflictError(`Job is ${job.status}, not accepting answers`);
  }
  validateAnswerForTaskType(job, task, body);

  let answer;
  try {
    answer = await LabelAnswer.create({
      taskId: task._id,
      jobId: job._id,
      userId: user.id,
      userEmail: (user.email || '').toLowerCase(),
      userName: user.name,
      ...(body.choiceKey ? { choiceKey: body.choiceKey } : {}),
      ...(body.rejectedMaskIds ? { rejectedMaskIds: body.rejectedMaskIds } : {}),
      ...(body.elapsedMs != null ? { elapsedMs: body.elapsedMs } : {})
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError('Already answered — undo first to change it');
    }
    throw err;
  }

  await LabelTask.updateOne(
    { _id: task._id },
    { $inc: { answersCount: 1 }, $addToSet: { answeredBy: user.id }, $unset: { leasedBy: '', leaseExpiresAt: '' } }
  );
  await maybeCompleteJob(job);
  return answer;
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
