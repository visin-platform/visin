import { Request, Response } from 'express';
import { ConflictError } from '@visin/backend-core';
import * as jobs from '../services/jobService';
import * as tasks from '../services/taskService';
import { requireUser } from '../services/groupAccessService';
import { assertCanWork } from '../services/jobAccessService';

export const nextTask = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const job = await jobs.getJob(req.params.id as string);
  if (job.status !== 'active') {
    throw new ConflictError(`Job is ${job.status}`);
  }
  await assertCanWork(job, user.id);
  const next = await tasks.nextTask(job, user, req.body?.excludeTaskIds || []);
  res.json({ success: true, data: next }); // null → nothing left for this user
};

/**
 * Open a copied editor link after checking the actual parent job visibility.
 * The response carries labels without annotator identity.
 */
export const getTask = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await tasks.getTaskItem(req.params.id as string, req.user?.id) });
};

/**
 * The frame at a 0-based position in the job — how the editor steps backwards
 * and forwards through frames that are already labeled, and where a visitor with
 * no queue of their own starts. `data: null` means the position is past the end.
 */
export const getTaskAtIndex = async (req: Request, res: Response): Promise<void> => {
  const item = await tasks.getTaskItemAtIndex(
    req.params.id as string,
    Number(req.params.index),
    req.user?.id
  );
  res.json({ success: true, data: item });
};

/** Resolve the task and check the caller may label its job: every write below starts here. */
const workOn = async (req: Request) => {
  const user = requireUser(req);
  const { task, job } = await tasks.getTaskWithJob(req.params.id as string);
  await assertCanWork(job, user.id);
  return { user, task, job };
};

const view = (annotation: { status: string; objects: unknown; updatedAt: Date }) => ({
  status: annotation.status,
  objects: annotation.objects,
  updatedAt: annotation.updatedAt
});

/** Autosave of the boxes. */
export const saveAnnotation = async (req: Request, res: Response): Promise<void> => {
  const { user, task, job } = await workOn(req);
  const annotation = await tasks.saveObjects(task, job, user, req.body);
  res.json({ success: true, data: view(annotation) });
};

/** Autosave of the mask: the run-length body the editor encodes (see utils/mask). */
export const saveMask = async (req: Request, res: Response): Promise<void> => {
  const { user, task, job } = await workOn(req);
  const body: unknown = req.body;
  const annotation = await tasks.saveMask(task, job, user, Buffer.isBuffer(body) ? body : Buffer.alloc(0));
  res.json({ success: true, data: { ...view(annotation), mask: { width: annotation.mask?.width, height: annotation.mask?.height } } });
};

export const clearMask = async (req: Request, res: Response): Promise<void> => {
  const { user, task, job } = await workOn(req);
  await tasks.clearMask(task, job, user);
  res.json({ success: true });
};

export const finishDone = async (req: Request, res: Response): Promise<void> => {
  const { user, task, job } = await workOn(req);
  const annotation = await tasks.finishTask(task, job, user, 'done', req.body?.elapsedMs);
  res.json({ success: true, data: view(annotation) });
};

export const finishSkip = async (req: Request, res: Response): Promise<void> => {
  const { user, task, job } = await workOn(req);
  const annotation = await tasks.finishTask(task, job, user, 'skipped', req.body?.elapsedMs);
  res.json({ success: true, data: view(annotation) });
};
