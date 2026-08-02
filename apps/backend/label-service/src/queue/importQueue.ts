import { Queue, JobsOptions } from 'bullmq';
import { createRedisConnection } from './connection';

export const IMPORT_QUEUE_NAME = 'bundle-import';

export interface ImportJobData {
  importJobId: string;
  bundleId: string;
}

// A transient failure (file-service restart, aborted transfer) is worth another
// go — ingest is idempotent, so a retry resumes where the dead attempt stopped.
// A structurally bad zip is not, and is thrown as UnrecoverableError instead.
const ATTEMPTS = Number(process.env.IMPORT_JOB_ATTEMPTS || 3);
const BACKOFF_MS = Number(process.env.IMPORT_JOB_BACKOFF_MS || 5000);

const JOB_OPTIONS: JobsOptions = {
  attempts: ATTEMPTS,
  backoff: { type: 'exponential', delay: BACKOFF_MS },
  // The ImportJob document is the durable record the client polls; the queue
  // entry is only the delivery mechanism, so don't keep it around forever.
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 24 * 3600, count: 100 }
};

// Created on first use, not at import time, so requiring this module (or
// anything that reaches it) never opens a socket in a test or a CLI script.
let queue: Queue<ImportJobData> | undefined;

export const getImportQueue = (): Queue<ImportJobData> => {
  if (!queue) {
    queue = new Queue<ImportJobData>(IMPORT_QUEUE_NAME, { connection: createRedisConnection() });
  }
  return queue;
};

/**
 * Queue one import. The ImportJob `_id` doubles as the BullMQ job id: it makes
 * the queue entry addressable for cancellation, and makes a double-submit a
 * no-op rather than a second worker racing the first over the same zip.
 */
export const enqueueImport = async (data: ImportJobData): Promise<void> => {
  await getImportQueue().add('import', data, { ...JOB_OPTIONS, jobId: data.importJobId });
};

/** Drop a not-yet-started import from the queue. No-op once a worker has it. */
export const removeQueuedImport = async (importJobId: string): Promise<void> => {
  const job = await getImportQueue().getJob(importJobId);
  await job?.remove().catch(() => undefined);
};

export const closeImportQueue = async (): Promise<void> => {
  await queue?.close();
  queue = undefined;
};
