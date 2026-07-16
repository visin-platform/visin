import { Request, Response } from 'express';
import * as svc from '../services/jobService';
import * as materialization from '../services/materializationService';
import * as exportSvc from '../services/exportService';
import { assertAdmin, assertMember, requireUser } from '../services/groupAccessService';
import { JobAction } from '../services/jobService';

export const createJob = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  await assertAdmin(req, req.body.groupId);
  const job = await svc.createJob(user, req.body);
  res.status(201).json({ success: true, data: job });
};

export const listJobs = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const role = (req.query.role as 'worker' | 'admin') || 'worker';
  const jobs = await svc.listJobsForUser(user.email!.toLowerCase(), role);
  res.json({ success: true, data: jobs });
};

export const getJob = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const job = await svc.getJob(req.params.id as string);
  await assertMember(req, job.groupId);
  const progress = await svc.getJobProgress(job, user.id);
  res.json({ success: true, data: { ...job.toObject(), progress } });
};

const transition = (action: JobAction) => async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertAdmin(req, job.groupId);
  const updated = await svc.transitionJob(job._id.toString(), action);
  res.json({ success: true, data: updated });
};

export const activateJob = transition('activate');
export const pauseJob = transition('pause');
export const resumeJob = transition('resume');
export const archiveJob = transition('archive');

export const materializeTasks = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertAdmin(req, job.groupId);
  const result = await materialization.materializeTasks(job, req.body);
  res.json({ success: true, data: result });
};

export const exportJob = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertAdmin(req, job.groupId);

  if (req.query.format === 'csv') {
    const csv = await exportSvc.exportCsv(job);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="job-${job._id}.csv"`);
    res.send(csv);
    return;
  }

  const rows = await exportSvc.exportRows(job);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="job-${job._id}.jsonl"`);
  res.send(rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
};

export const jobStats = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertMember(req, job.groupId);
  const stats = await exportSvc.jobStats(job);
  res.json({ success: true, data: stats });
};
