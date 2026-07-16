import { Request, Response } from 'express';
import { UnauthorizedError } from '@visin/backend-core';
import * as svc from '../services/jobService';

const requireUser = (req: Request) => {
  if (!req.user?.id) {
    throw new UnauthorizedError('Authenticated user required');
  }
  return req.user;
};

export const createJob = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const job = await svc.createJob(user, req.body);
  res.status(201).json({ success: true, data: job });
};

export const listJobs = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const jobs = await svc.listJobsForUser(user.id);
  res.json({ success: true, data: jobs });
};
