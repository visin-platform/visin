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
