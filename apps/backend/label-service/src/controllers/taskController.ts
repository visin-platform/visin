import { Request, Response } from 'express';
import { ConflictError } from '@visin/backend-core';
import * as jobs from '../services/jobService';
import * as tasks from '../services/taskService';
import { assertMember, requireUser } from '../services/groupAccessService';

export const nextTask = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const job = await jobs.getJob(req.params.id as string);
  await assertMember(req, job.groupId);
  if (job.status !== 'active') {
    throw new ConflictError(`Job is ${job.status}`);
  }
  const next = await tasks.nextTask(job, user, req.body?.excludeTaskIds || []);
  res.json({ success: true, data: next }); // null → nothing left for this user
};

/**
 * Open a copied workbench link after checking the actual parent job visibility.
 * The response carries verdicts without labeler identity.
 */
export const getTask = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await tasks.getTaskItem(req.params.id as string, req.user?.id) });
};

/**
 * The frame at a 0-based position in the job — how the workbench steps backwards
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

export const submitAnswer = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const { task, job } = await tasks.getTaskWithJob(req.params.id as string);
  await assertMember(req, job.groupId);
  const answer = await tasks.submitAnswer(task, job, user, req.body);
  res.status(201).json({ success: true, data: answer });
};

export const undoAnswer = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const { task, job } = await tasks.getTaskWithJob(req.params.id as string);
  await assertMember(req, job.groupId);
  await tasks.undoAnswer(task, job, user);
  res.json({ success: true });
};
