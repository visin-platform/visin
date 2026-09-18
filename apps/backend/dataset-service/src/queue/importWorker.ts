import { Worker, Job, UnrecoverableError } from 'bullmq';
import { logger } from '@visin/backend-core';
import { runImport, markImportFailed } from '../services/importService';
import { runScan, markScanFailed } from '../services/scanService';
import { runDelete, runRemoveGroup } from '../services/deleteService';
import { NonRetryableImportError } from '../utils/boundedZip';
import { createRedisConnection } from './connection';
import { DatasetJobData, DELETE_JOB, IMPORT_QUEUE_NAME, ImportJobData, REMOVE_GROUP_JOB, RemoveGroupJobData, SCAN_JOB, ScanJobData } from './importQueue';

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
export const willRetry = (job: Job<DatasetJobData>, err: Error): boolean =>
  !(err instanceof UnrecoverableError || err.name === 'UnrecoverableError') &&
  job.attemptsMade < (job.opts.attempts ?? 1);

export const processImportJob = async (job: Job<DatasetJobData>): Promise<void> => {
  try {
    if (job.name === DELETE_JOB) {
      await runDelete(job.data.datasetId);
      return;
    }
    if (job.name === REMOVE_GROUP_JOB) {
      const { datasetId, group } = job.data as RemoveGroupJobData;
      await runRemoveGroup(datasetId, group);
      return;
    }
    if (job.name === SCAN_JOB) {
      const { datasetId, fileId } = job.data as ScanJobData;
      await runScan(datasetId, fileId);
      return;
    }
    const { datasetId, importId } = job.data as ImportJobData;
    logger.info('Dataset import started', { datasetId, importId, attempt: job.attemptsMade + 1 });
    await runImport(datasetId, importId);
  } catch (err) {
    // Rethrown as unrecoverable so BullMQ stops here instead of re-downloading
    // a zip that will fail identically.
    throw err instanceof NonRetryableImportError ? new UnrecoverableError(err.message) : err;
  }
};

export const handleFailedImport = (job: Job<DatasetJobData> | undefined, err: Error): void => {
  if (!job) {
    logger.error('Dataset job failed without a job', { error: err.message });
    return;
  }
  const { datasetId } = job.data;
  if (willRetry(job, err)) {
    logger.warn('Dataset job attempt failed, retrying', { datasetId, job: job.name, attempt: job.attemptsMade, error: err.message });
    return;
  }
  logger.error('Dataset job failed', { datasetId, job: job.name, error: err.message });
  // A deletion or group removal keeps its mark and is queued again at the next startup.
  if (job.name === DELETE_JOB || job.name === REMOVE_GROUP_JOB) return;
  // The processor is already gone, so this is the last chance to close the
  // work out — without it a dead import or scan polls as unfinished forever.
  const closing =
    job.name === SCAN_JOB
      ? markScanFailed(datasetId, (job.data as ScanJobData).fileId, err.message)
      : markImportFailed(datasetId, (job.data as ImportJobData).importId, err.message);
  closing.catch((markErr: Error) => logger.error('Could not mark dataset job failed', { datasetId, error: markErr.message }));
};

export const createImportWorker = (): Worker<DatasetJobData> => {
  const worker = new Worker<DatasetJobData>(IMPORT_QUEUE_NAME, processImportJob, {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY,
    maxStalledCount: MAX_STALLED_COUNT
  });
  worker.on('failed', handleFailedImport);
  worker.on('error', (err) => logger.error('Import worker error', { error: err.message }));
  return worker;
};
