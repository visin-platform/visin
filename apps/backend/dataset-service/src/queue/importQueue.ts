import { Queue, JobsOptions } from 'bullmq';
import { createRedisConnection } from './connection';

export const IMPORT_QUEUE_NAME = 'dataset-import';

export interface ImportJobData {
  datasetId: string;
  importId: string;
}

export interface ScanJobData {
  datasetId: string;
  fileId: string;
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
const ATTEMPTS = Number(process.env.DATASET_IMPORT_JOB_ATTEMPTS || 3);
const BACKOFF_MS = Number(process.env.DATASET_IMPORT_JOB_BACKOFF_MS || 5000);

const JOB_OPTIONS: JobsOptions = {
  attempts: ATTEMPTS,
  backoff: { type: 'exponential', delay: BACKOFF_MS },
  // The dataset's `import` field is the durable record the client polls; the
  // queue entry is only the delivery mechanism, so don't keep it around forever.
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 24 * 3600, count: 100 }
};

// Created on first use, not at import time, so requiring this module (or
// anything that reaches it) never opens a socket in a test or a CLI script.
let queue: Queue<DatasetJobData> | undefined;

export const getImportQueue = (): Queue<DatasetJobData> => {
  if (!queue) {
    queue = new Queue<DatasetJobData>(IMPORT_QUEUE_NAME, { connection: createRedisConnection() });
  }
  return queue;
};

/**
 * Queue one import. The import id doubles as the BullMQ job id: it makes the
 * queue entry addressable for cancellation, and makes a double-submit a no-op
 * rather than a second worker racing the first over the same zip.
 */
export const enqueueImport = async (data: ImportJobData): Promise<void> => {
  await getImportQueue().add(IMPORT_JOB, data, { ...JOB_OPTIONS, jobId: data.importId });
};

/**
 * Queue reading an uploaded zip's index. Runs on the same worker as imports, so
 * the request that finishes an upload returns at once and the browser can leave;
 * the dataset's `scan` is what the page polls.
 */
export const enqueueScan = async (data: ScanJobData): Promise<void> => {
  await getImportQueue().add(SCAN_JOB, data, JOB_OPTIONS);
};

/**
 * Queue removing a dataset's files, rows and record. The job id makes asking
 * twice (a retried request, the startup sweep) one deletion.
 */
export const enqueueDelete = async (data: DeleteJobData): Promise<void> => {
  await getImportQueue().add(DELETE_JOB, data, { ...JOB_OPTIONS, jobId: `delete-${data.datasetId}` });
};

/** Queue removing one image group; one job per group however often it is asked for. */
export const enqueueRemoveGroup = async (data: RemoveGroupJobData): Promise<void> => {
  // Group names are free text; hex keeps the job id to characters BullMQ accepts.
  const jobId = `remove-group-${data.datasetId}-${Buffer.from(data.group).toString('hex')}`;
  await getImportQueue().add(REMOVE_GROUP_JOB, data, { ...JOB_OPTIONS, jobId });
};

/** Drop a not-yet-started import from the queue. No-op once a worker has it. */
export const removeQueuedImport = async (importId: string): Promise<void> => {
  const job = await getImportQueue().getJob(importId);
  await job?.remove().catch(() => undefined);
};

export const closeImportQueue = async (): Promise<void> => {
  await queue?.close();
  queue = undefined;
};
