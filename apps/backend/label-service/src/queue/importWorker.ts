import { Worker, Job, UnrecoverableError } from 'bullmq';
import { logger } from '@visin/backend-core';
import { runImport, markImportFailed, NonRetryableIngestError } from '../services/ingestService';
import { createRedisConnection } from './connection';
import { IMPORT_QUEUE_NAME, ImportJobData } from './importQueue';

// Ingest is CPU-bound (sharp decodes and rescales every frame) and, in the
// default deployment, shares an event loop with the API. One at a time keeps a
// large bundle from starving request handling; raise it only with a dedicated
// worker container.
const CONCURRENCY = Number(process.env.IMPORT_CONCURRENCY || 1);

// A worker's lock is renewed while the processor runs, so a long ingest is not
// "stalled" — but a killed process stops renewing, and BullMQ hands the job to
// another worker. Two such recoveries, then it fails for good.
const MAX_STALLED_COUNT = Number(process.env.IMPORT_MAX_STALLED || 2);

/**
 * Whether BullMQ will hand this job back after `err`.
 *
 * Note the missing `+ 1` compared to Job.shouldRetryJob: by the time the
 * 'failed' event fires, `moveToFailed` has already counted the attempt that
 * just failed, so `attemptsMade` here is attempts *made*, not attempts *before*.
 */
const willRetry = (job: Job<ImportJobData>, err: Error): boolean =>
  !(err instanceof UnrecoverableError || err.name === 'UnrecoverableError') &&
  job.attemptsMade < (job.opts.attempts ?? 1);

const process_ = async (job: Job<ImportJobData>): Promise<void> => {
  const { importJobId, bundleId } = job.data;
  logger.info('Bundle import started', { bundleId, importJobId, attempt: job.attemptsMade + 1 });
  try {
    await runImport(importJobId);
  } catch (err) {
    // Rethrown as unrecoverable so BullMQ stops here instead of re-downloading
    // a zip that will fail identically.
    throw err instanceof NonRetryableIngestError ? new UnrecoverableError(err.message) : err;
  }
};

export const createImportWorker = (): Worker<ImportJobData> => {
  const worker = new Worker<ImportJobData>(IMPORT_QUEUE_NAME, process_, {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY,
    maxStalledCount: MAX_STALLED_COUNT
  });

  worker.on('failed', (job, err) => {
    if (!job) {
      logger.error('Bundle import failed without a job', { error: err.message });
      return;
    }
    const { importJobId, bundleId } = job.data;
    if (willRetry(job, err)) {
      logger.warn('Bundle import attempt failed, retrying', {
        bundleId,
        importJobId,
        attempt: job.attemptsMade,
        error: err.message
      });
      return;
    }
    logger.error('Bundle import failed', { bundleId, importJobId, error: err.message });
    // The processor is already gone, so this is the last chance to close the
    // ImportJob out — without it a dead import polls as `running` until the
    // staleness window in bundleService expires.
    markImportFailed(importJobId, err.message).catch((markErr: Error) =>
      logger.error('Could not mark import failed', { importJobId, error: markErr.message })
    );
  });

  worker.on('error', (err) => logger.error('Import worker error', { error: err.message }));

  return worker;
};
