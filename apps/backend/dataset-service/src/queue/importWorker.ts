import { Worker, Job, UnrecoverableError, type WorkerOptions } from 'bullmq';
import { logger } from '@visin/backend-core';
import { runImport, markImportFailed } from '../services/importService';
import { runScan, markScanFailed } from '../services/scanService';
import { runDelete, runRemoveGroup } from '../services/deleteService';
import { NonRetryableImportError } from '../utils/boundedZip';
import { createRedisConnection } from './connection';
import { DatasetJobData, DELETE_JOB, IMPORT_QUEUE_NAME, ImportJobData, REMOVE_GROUP_JOB, RemoveGroupJobData, SCAN_JOB, ScanJobData } from './importQueue';
import { IMPORT_MAX_STALLED, IMPORT_WORKERS } from './constants';

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
      const { datasetId, fileId, scanId } = job.data as ScanJobData;
      await runScan(datasetId, fileId, scanId);
      return;
    }
    const { datasetId, importId, deliveryId } = job.data as ImportJobData;
    logger.info('Dataset import started', { datasetId, importId, attempt: job.attemptsMade + 1 });
    await runImport(datasetId, importId, deliveryId);
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
  // Deletions and group removals keep their marks for the periodic recovery sweep.
  if (job.name === DELETE_JOB || job.name === REMOVE_GROUP_JOB) return;
  // The processor is already gone, so this is the last chance to close the
  // work out promptly. Recovery retries a lost Mongo outcome from the retained job.
  const closing =
    job.name === SCAN_JOB
      ? markScanFailed(datasetId, (job.data as ScanJobData).fileId, err.message, (job.data as ScanJobData).scanId)
      : markImportFailed(datasetId, (job.data as ImportJobData).importId, err.message, (job.data as ImportJobData).deliveryId);
  closing.catch((markErr: Error) => logger.error('Could not mark dataset job failed', { datasetId, error: markErr.message }));
};

export const createImportWorker = (options: Pick<WorkerOptions, 'stalledInterval'> = {}): Worker<DatasetJobData> => {
  const connection = createRedisConnection();
  // One job at a time by default: image extraction already runs in parallel on
  // the API's event loop. BullMQ renews live locks and recovers killed workers.
  const worker = new Worker<DatasetJobData>(IMPORT_QUEUE_NAME, processImportJob, {
    connection,
    concurrency: IMPORT_WORKERS,
    maxStalledCount: IMPORT_MAX_STALLED,
    ...options
  });
  worker.on('failed', handleFailedImport);
  worker.on('error', (err) => logger.error('Import worker error', { error: err.message }));
  worker.on('closed', () => connection.disconnect());
  return worker;
};
