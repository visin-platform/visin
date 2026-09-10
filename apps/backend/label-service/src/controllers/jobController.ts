import { Request, Response } from 'express';
import * as svc from '../services/jobService';
import * as materialization from '../services/materializationService';
import * as exportSvc from '../services/exportService';
import { assertAdmin, requireUser } from '../services/groupAccessService';
import { JobAction } from '../services/jobService';

export const createJob = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  await assertAdmin(req, req.body.groupId);
  const job = await svc.createJob(user, req.body);
  res.status(201).json({ success: true, data: job });
};

/**
 * Anonymous callers get the public listing — every active job — so progress can
 * be shared without an account. `role=admin` is a question about groups the
 * caller administers, which is nothing when there is no caller, so it answers
 * with an empty list rather than the public one.
 */
export const listJobs = async (req: Request, res: Response): Promise<void> => {
  const role = (req.query.role as 'worker' | 'admin') || 'worker';
  if (!req.user?.id) {
    res.json({ success: true, data: role === 'admin' ? [] : await svc.listPublicJobs() });
    return;
  }
  const user = requireUser(req);
  const jobs = await svc.listJobsForUser(user.id, role, user.id);
  res.json({ success: true, data: jobs });
};

/** Public: a job's definition and progress are what a shared link shows. */
export const getJob = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  const progress = await svc.getJobProgress(job, req.user?.id || '');
  const body = req.user?.id ? job.toObject() : svc.withoutCreatorIdentity(job);
  res.json({ success: true, data: { ...body, progress } });
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

/** Irreversible: the job, its tasks and every answer collected against it. */
export const deleteJob = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertAdmin(req, job.groupId);
  const removed = await svc.deleteJob(job._id.toString());
  res.json({ success: true, data: removed });
};

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

  // How the rows came to be, rather than the rows themselves: sampling spec,
  // redundancy, and per-value inclusion counts, so a rate measured on this job
  // scales back to the bundle without the analyst reconstructing the scoping.
  if (req.query.format === 'manifest') {
    const manifest = await exportSvc.exportManifest(job);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="job-${job._id}.manifest.json"`);
    res.send(JSON.stringify(manifest, null, 2));
    return;
  }

  const rows = await exportSvc.exportRows(job);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="job-${job._id}.jsonl"`);
  res.send(rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
};

/**
 * Public, minus the names: totals, agreement and per-stratum breakdown are the
 * progress this is shared to show, but `perUser` is a list of labelers' email
 * addresses and is dropped for a caller with no identity of their own.
 */
export const jobStats = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  const stats = await exportSvc.jobStats(job);
  if (!req.user?.id) {
    const { perUser: _perUser, ...publicStats } = stats;
    res.json({ success: true, data: publicStats });
    return;
  }
  res.json({ success: true, data: stats });
};
