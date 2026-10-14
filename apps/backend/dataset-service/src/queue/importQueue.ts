import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { Queue, JobsOptions, type Job } from 'bullmq';
import { logger, ServiceUnavailableError } from '@visin/backend-core';
import { createRedisConnection } from './connection';
import { IMPORT_ATTEMPTS, IMPORT_BACKOFF_MS, QUEUE_TIMEOUT_MS } from './constants';

export const IMPORT_QUEUE_NAME = 'dataset-import';

export interface ImportJobData {
  datasetId: string;
  importId: string;
  /** A resume keeps the import's files but has its own queue delivery. */
  deliveryId?: string;
}

export interface ScanJobData {
  datasetId: string;
  fileId: string;
  /** Different rescans of the same file must not share a result or job. */
  scanId?: string;
}

export interface DeleteJobData {
  datasetId: string;
}

export interface RemoveGroupJobData {
  datasetId: string;
  group: string;
}

export type DatasetJobData = ImportJobData | ScanJobData | DeleteJobData | RemoveGroupJobData;

/** Job names on the queue: extracting images, reading a zip's index, removing a dataset. */
export const IMPORT_JOB = 'import';
export const SCAN_JOB = 'scan';
export const DELETE_JOB = 'delete';
export const REMOVE_GROUP_JOB = 'remove-group';

// A transient failure (file-service restart, aborted transfer) is worth another
// go — import is idempotent, so a retry resumes where the dead attempt stopped.
// A structurally bad zip is not, and is thrown as UnrecoverableError instead.
const JOB_OPTIONS: JobsOptions = {
  attempts: IMPORT_ATTEMPTS,
  backoff: { type: 'exponential', delay: IMPORT_BACKOFF_MS },
  // The dataset's `import` field is the durable record the client polls; the
  // queue entry is only the delivery mechanism, so don't keep it around forever.
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 24 * 3600, count: 100 }
};

// Created on first use, not at import time, so requiring this module (or
// anything that reaches it) never opens a socket in a test or a CLI script.
let queue: Queue<DatasetJobData> | undefined;
let connection: Redis | undefined;
const closingQueues = new Set<Promise<void>>();

export const getImportQueue = (): Queue<DatasetJobData> => {
  if (!queue) {
    connection = createRedisConnection('producer');
    queue = new Queue<DatasetJobData>(IMPORT_QUEUE_NAME, { connection });
    queue.on('error', () => logger.warn('Dataset queue connection unavailable'));
  }
  return queue;
};

/** BullMQ also waits for initialization before sending a command. An ioredis
 * command timeout alone does not bound that wait. Disconnect on failure so
 * abandoned initialization cannot enqueue work minutes after its caller left.
 * Mongo's work record remains authoritative and is reconciled on recovery. */
async function queueOperation<T>(work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ownedQueue = getImportQueue();
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ServiceUnavailableError('Dataset queue is unavailable; work will be recovered when Redis returns')), QUEUE_TIMEOUT_MS);
      })
    ]);
  } catch {
    // Do not close a successor connection created by another failed request.
    if (queue === ownedQueue) {
      connection?.disconnect();
      connection = undefined;
      queue = undefined;
      const closing = ownedQueue.close()
        .catch(() => { logger.warn('Could not close unavailable dataset queue'); })
        .finally(() => closingQueues.delete(closing));
      closingQueues.add(closing);
    }
    throw new ServiceUnavailableError('Dataset queue is unavailable; work will be recovered when Redis returns');
  } finally {
    clearTimeout(timer);
  }
}

export const importJobId = (data: ImportJobData): string => data.deliveryId ?? data.importId;
export const scanJobId = (data: ScanJobData): string =>
  `scan-${data.datasetId}-${data.scanId ?? createHash('sha256').update(data.fileId).digest('hex')}`;

/** Missing means the queue lost delivery; waiting/delayed/active must be left
 * alone even if an import has been sitting behind a large job for hours. */
export const getDatasetJob = (jobId: string): Promise<Job<DatasetJobData> | undefined> =>
  queueOperation(() => getImportQueue().getJob(jobId));

export const getDatasetJobState = (job: Job<DatasetJobData>) => queueOperation(() => job.getState());

/** Deletions retain their Mongo mark until all work finishes. Retry a retained
 * terminal job instead of adding its existing id (which BullMQ treats as a
 * duplicate). The retry's atomic state check also handles concurrent sweeps. */
async function enqueueRemoval(name: string, data: DeleteJobData | RemoveGroupJobData, jobId: string): Promise<void> {
  await queueOperation(async () => {
    const target = getImportQueue();
    const job = await target.getJob(jobId);
    const state = await job?.getState();
    if (job && (state === 'failed' || state === 'completed')) {
      try {
        await job.retry(state, { resetAttemptsMade: true, resetAttemptsStarted: true });
      } catch (error) {
        const changed = await job.getState();
        if (changed === state) throw error;
        if (changed === 'unknown') await target.add(name, data, { ...JOB_OPTIONS, jobId });
      }
    } else if (!job || state === 'unknown') {
      await target.add(name, data, { ...JOB_OPTIONS, jobId });
    }
  });
}

/**
 * Queue one delivery of an import. Stable across enqueue/recovery retries;
 * explicit resumes have a new delivery id while preserving their stored files.
 */
export const enqueueImport = async (data: ImportJobData): Promise<void> => {
  await queueOperation(() => getImportQueue().add(IMPORT_JOB, data, { ...JOB_OPTIONS, jobId: importJobId(data) }));
};

/**
 * Queue reading an uploaded zip's index. Runs on the same worker as imports, so
 * the request that finishes an upload returns at once and the browser can leave;
 * the dataset's `scan` is what the page polls.
 */
export const enqueueScan = async (data: ScanJobData): Promise<void> => {
  await queueOperation(() => getImportQueue().add(SCAN_JOB, data, { ...JOB_OPTIONS, jobId: scanJobId(data) }));
};

/**
 * Queue removing a dataset's files, rows and record. The job id makes asking
 * twice (a retried request, the startup sweep) one deletion.
 */
export const enqueueDelete = async (data: DeleteJobData): Promise<void> => {
  await enqueueRemoval(DELETE_JOB, data, `delete-${data.datasetId}`);
};

/** Queue removing one image group; one job per group however often it is asked for. */
export const enqueueRemoveGroup = async (data: RemoveGroupJobData): Promise<void> => {
  // Group names are free text; hex keeps the job id to characters BullMQ accepts.
  const jobId = `remove-group-${data.datasetId}-${Buffer.from(data.group).toString('hex')}`;
  await enqueueRemoval(REMOVE_GROUP_JOB, data, jobId);
};

/** Drop a not-yet-started import from the queue. No-op once a worker has it. */
export const removeQueuedImport = async (importId: string): Promise<void> => {
  await queueOperation(async () => {
    const job = await getImportQueue().getJob(importId);
    await job?.remove().catch(() => undefined);
  });
};

export const closeImportQueue = async (): Promise<void> => {
  const closing = queue;
  const closingConnection = connection;
  queue = undefined;
  connection = undefined;
  // The explicitly supplied ioredis instance is shared from BullMQ's point of
  // view; Queue.close() alone does not own or close that socket.
  closingConnection?.disconnect();
  await Promise.all([...closingQueues, closing?.close()]);
};
