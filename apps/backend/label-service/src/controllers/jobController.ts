import { Request, Response } from 'express';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BadRequestError, ConflictError, HttpError } from '@visin/backend-core';
import * as svc from '../services/jobService';
import * as materialization from '../services/materializationService';
import * as exportSvc from '../services/exportService';
import * as bundles from '../services/bundleService';
import * as importer from '../services/importService';
import { describeFormats } from '../formats';
import { IMPORT_MAX_BYTES } from '../limits';
import type { ExportQuery, ImportQuery } from '../validation/jobSchemas';
import { requireUser } from '../services/groupAccessService';
import { assertJobAdmin, getJobReadAccess } from '../services/jobAccessService';
import { JobAction } from '../services/jobService';

export const createJob = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
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
  // Who the job belongs to is its dataset's owner, shown to those who can reach it.
  const dataset = access.member ? await svc.jobDataset(job) : undefined;
  res.json({ success: true, data: { ...body, ...(dataset ? { dataset } : {}), progress, canLabel: access.canWork, canManage: access.isAdmin } });
};

const transition = (action: JobAction) => async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertJobAdmin(job, req.user?.id);
  const updated = await svc.transitionJob(job._id.toString(), action);
  res.json({ success: true, data: updated });
};

export const activateJob = transition('activate');
export const pauseJob = transition('pause');
export const resumeJob = transition('resume');
export const archiveJob = transition('archive');

export const setJobVisibility = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertJobAdmin(job, req.user?.id);
  res.json({ success: true, data: await svc.setJobVisibility(job._id.toString(), req.body.isPublic) });
};

export const setModelClassMapping = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertJobAdmin(job, req.user?.id);
  res.json({ success: true, data: await svc.setModelClassMapping(job, req.body.mapping) });
};

/** Irreversible: the job, its tasks and every label collected against it. */
export const deleteJob = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string, true);
  await assertJobAdmin(job, req.user?.id);
  const removed = await svc.deleteJob(job._id.toString());
  res.json({ success: true, data: removed });
};

export const materializeTasks = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertJobAdmin(job, req.user?.id);
  const result = await materialization.materializeTasks(job, req.body);
  res.json({ success: true, data: result });
};

/**
 * Labels leave as a zip in the requested format, or `manifest` for how the job
 * was set up. Staying admin-only: the labels themselves are the product, not
 * progress about them.
 */
export const exportJob = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  await assertJobAdmin(job, req.user?.id);
  const { format, include } = req.query as unknown as ExportQuery;

  if (format === 'manifest') {
    const manifest = await exportSvc.exportManifest(job);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="job-${job._id}.manifest.json"`);
    res.send(JSON.stringify(manifest, null, 2));
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="job-${job._id}-${format}.zip"`);
  try {
    await bundles.streamExport(job, format, include, res);
    res.end();
  } catch (error) {
    // The status line is gone once bytes are flowing; cutting the connection is
    // the only way left to say the file is not whole.
    if (res.headersSent) {
      res.destroy(error as Error);
      return;
    }
    throw error;
  }
};

/** The formats labels can be exported and imported as, with what each can hold. */
export const listFormats = async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: describeFormats() });
};


/**
 * The request body is the zip itself, so it goes to a temporary file rather than
 * memory: an archive of masks is hundreds of megabytes and the Pi has a few
 * gigabytes. The options travel in the query.
 */
export const importLabels = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const job = await svc.getJob(req.params.id as string);
  await assertJobAdmin(job, user.id);
  if (job.tasksCount === 0) {
    throw new ConflictError('The job has no frames yet — materialize it first');
  }
  const limit = IMPORT_MAX_BYTES;
  const tooLarge = (): HttpError => new HttpError(413, `The archive is larger than ${Math.floor(limit / 1024 / 1024)} MiB`);
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > limit) {
    throw tooLarge();
  }

  const folder = await mkdtemp(join(tmpdir(), 'visin-labels-'));
  try {
    const target = join(folder, 'labels.zip');
    let received = 0;
    await pipeline(
      req,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          received += chunk.length;
          if (received > limit) {
            throw tooLarge();
          }
          yield chunk;
        }
      },
      createWriteStream(target)
    );
    if (received === 0) {
      throw new BadRequestError('Send the labels archive as the request body');
    }
    const report = await importer.importLabels(job, user, target, req.query as unknown as ImportQuery);
    res.json({ success: true, data: report });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
};

/**
 * Aggregates follow job visibility. Annotator names/emails require managing the
 * job's dataset, matching the identity-bearing exports.
 */
export const jobStats = async (req: Request, res: Response): Promise<void> => {
  const job = await svc.getJob(req.params.id as string);
  const { isAdmin: includeIdentities } = await getJobReadAccess(job, req.user?.id);
  const stats = await exportSvc.jobStats(job);
  res.json({ success: true, data: {
    tasks: stats.tasks,
    completed: stats.completed,
    done: stats.done,
    skipped: stats.skipped,
    objects: stats.objects,
    perClass: stats.perClass,
    perStratum: stats.perStratum,
    ...(includeIdentities ? { perUser: stats.perUser } : {})
  } });
};
