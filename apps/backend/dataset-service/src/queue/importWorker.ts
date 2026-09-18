import { Worker, Job, UnrecoverableError } from 'bullmq';
import { logger } from '@visin/backend-core';
import { runImport, markImportFailed } from '../services/importService';
import { NonRetryableImportError } from '../utils/boundedZip';
import { createRedisConnection } from './connection';
import { IMPORT_QUEUE_NAME, ImportJobData } from './importQueue';

// One import at a time: each one already processes several images in parallel
// (DATASET_IMPORT_CONCURRENCY), and in the default deployment the worker shares
// an event loop with the API. Raise it only with a dedicated worker container.
const CONCURRENCY = Number(process.env.DATASET_IMPORT_WORKERS || 1);

// A worker's lock is renewed while the processor runs, so a long import is not
// "stalled" — but a killed process stops renewing, and BullMQ hands the job to
// another worker. Two such recoveries, then it fails for good.
const MAX_STALLED_COUNT = Number(process.env.DATASET_IMPORT_MAX_STALLED || 2);

/**
 * Whether BullMQ will hand this job back after `err`. By the time the 'failed'
 * event fires, `attemptsMade` already counts the attempt that just failed.
 */
export const willRetry = (job: Job<ImportJobData>, err: Error): boolean =>
  !(err instanceof UnrecoverableError || err.name === 'UnrecoverableError') &&
  job.attemptsMade < (job.opts.attempts ?? 1);

export const processImportJob = async (job: Job<ImportJobData>): Promise<void> => {
  const { datasetId, importId } = job.data;
  logger.info('Dataset import started', { datasetId, importId, attempt: job.attemptsMade + 1 });
  try {
    await runImport(datasetId, importId);
  } catch (err) {
    // Rethrown as unrecoverable so BullMQ stops here instead of re-downloading
    // a zip that will fail identically.
    throw err instanceof NonRetryableImportError ? new UnrecoverableError(err.message) : err;
  }
};

export const handleFailedImport = (job: Job<ImportJobData> | undefined, err: Error): void => {
  if (!job) {
    logger.error('Dataset import failed without a job', { error: err.message });
    return;
  }
  const { datasetId, importId } = job.data;
  if (willRetry(job, err)) {
    logger.warn('Dataset import attempt failed, retrying', { datasetId, importId, attempt: job.attemptsMade, error: err.message });
    return;
  }
  logger.error('Dataset import failed', { datasetId, importId, error: err.message });
  // The processor is already gone, so this is the last chance to close the
  // import out — without it a dead import polls as `running` until its
  // heartbeat goes stale.
  markImportFailed(datasetId, importId, err.message).catch((markErr: Error) =>
    logger.error('Could not mark import failed', { importId, error: markErr.message })
  );
};

export const createImportWorker = (): Worker<ImportJobData> => {
  const worker = new Worker<ImportJobData>(IMPORT_QUEUE_NAME, processImportJob, {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY,
    maxStalledCount: MAX_STALLED_COUNT
  });
  worker.on('failed', handleFailedImport);
  worker.on('error', (err) => logger.error('Import worker error', { error: err.message }));
  return worker;
};
