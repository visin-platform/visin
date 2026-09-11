import { Request, Response } from 'express';
import * as svc from '../services/jobService';
import * as materialization from '../services/materializationService';
import * as exportSvc from '../services/exportService';
import { assertAdmin, requireUser } from '../services/groupAccessService';
import { getJobReadAccess } from '../services/jobAccessService';
import { JobAction } from '../services/jobService';

export const createJob = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  await assertAdmin(req, req.body.groupId);
  const job = await svc.createJob(user, req.body);
  res.status(201).json({ success: true, data: job });
};

/**
 * Anonymous callers get explicitly published active jobs, so progress can
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
  const jobs = await svc.listJobsForUser(user.id, role);
  res.json({ success: true, data: jobs });
};

/** Resolve visibility before reading or returning job content and progress. */
export const getJob = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  const access = await getJobReadAccess(job, req.user?.id);
  const progress = await svc.getJobProgress(job, req.user?.id || '');
  const body = access.member ? job.toObject() : svc.withoutCreatorIdentity(job);
  res.json({ success: true, data: { ...body, progress,
    canLabel: access.member && (job.status === 'active' || job.status === 'completed')
  } });
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

export const setJobVisibility = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertAdmin(req, job.groupId);
  res.json({ success: true, data: await svc.setJobVisibility(job._id.toString(), req.body.isPublic) });
};

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
 * Aggregates follow job visibility. Labeler names/emails require owner/admin membership in
 * the job's group, matching the identity-bearing exports.
 */
export const jobStats = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  const { isAdmin: includeIdentities } = await getJobReadAccess(job, req.user?.id);
  const stats = await exportSvc.jobStats(job);
  res.json({ success: true, data: {
    tasks: stats.tasks,
    completed: stats.completed,
    answers: stats.answers,
    perStratum: stats.perStratum,
    agreement: stats.agreement,
    ...(includeIdentities ? { perUser: stats.perUser } : {})
  } });
};
