import { vi } from 'vitest';
const { workerConstructor, on, FakeUnrecoverableError } = vi.hoisted(() => {
  class FakeUnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  }
  const on = vi.fn();
  const workerConstructor = vi.fn(function () {
    return { on };
  });
  return { workerConstructor, on, FakeUnrecoverableError };
});
vi.mock('bullmq', async () => {
  const module = await (() => ({ Worker: workerConstructor, UnrecoverableError: FakeUnrecoverableError }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../queue/connection', async () => {
  const module = await (() => ({
    createRedisConnection: vi.fn(function () {
      return 'REDIS';
    })
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/importService', async () => {
  const module = await (() => ({ runImport: vi.fn(), markImportFailed: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/scanService', async () => {
  const module = await (() => ({
    runScan: vi.fn(),
    markScanFailed: vi.fn(function () {
      return Promise.resolve();
    })
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/deleteService', async () => {
  const module = await (() => ({ runDelete: vi.fn(), runRemoveGroup: vi.fn() }))();
  return Object.assign({ default: module }, module);
});

import type { Job } from 'bullmq';
import { createImportWorker, handleFailedImport, processImportJob, willRetry } from '../../queue/importWorker';
import { IMPORT_QUEUE_NAME, ImportJobData } from '../../queue/importQueue';
import { markImportFailed, runImport } from '../../services/importService';
import { markScanFailed, runScan } from '../../services/scanService';
import { runDelete, runRemoveGroup } from '../../services/deleteService';
import { NonRetryableImportError } from '../../utils/boundedZip';

const job = (attemptsMade: number, attempts = 3) =>
  ({
    name: 'import',
    data: { datasetId: 'd', importId: 'i' },
    attemptsMade,
    opts: { attempts }
  }) as unknown as Job<ImportJobData>;
const scanJob = (attemptsMade: number) =>
  ({
    name: 'scan',
    data: { datasetId: 'd', fileId: 'f.zip' },
    attemptsMade,
    opts: { attempts: 3 }
  }) as unknown as Job<ImportJobData>;

beforeEach(() => vi.clearAllMocks());

it('registers a worker on the import queue', () => {
  createImportWorker();
  expect(workerConstructor).toHaveBeenCalledWith(
    IMPORT_QUEUE_NAME,
    processImportJob,
    expect.objectContaining({ connection: 'REDIS', concurrency: 1 })
  );
  expect(on).toHaveBeenCalledWith('failed', handleFailedImport);
  const errorHandler = on.mock.calls.find(([event]) => event === 'error')[1];
  errorHandler(new Error('redis down'));
});

it('runs the import and turns a bad archive into an unrecoverable failure', async () => {
  await processImportJob(job(0));
  expect(runImport).toHaveBeenCalledWith('d', 'i', undefined);

  vi.mocked(runImport).mockRejectedValueOnce(new NonRetryableImportError('too big'));
  await expect(processImportJob(job(0))).rejects.toBeInstanceOf(FakeUnrecoverableError);
  vi.mocked(runImport).mockRejectedValueOnce(new Error('transient'));
  await expect(processImportJob(job(0))).rejects.toThrow('transient');
});

it('marks the import failed only when no retry is left', async () => {
  expect(willRetry(job(1), new Error('x'))).toBe(true);
  expect(willRetry(job(3), new Error('x'))).toBe(false);
  expect(willRetry(job(1), new FakeUnrecoverableError('x'))).toBe(false);

  handleFailedImport(job(1), new Error('x'));
  expect(markImportFailed).not.toHaveBeenCalled();
  vi.mocked(markImportFailed).mockRejectedValueOnce(new Error('mongo down'));
  handleFailedImport(job(3), new Error('final'));
  expect(markImportFailed).toHaveBeenCalledWith('d', 'i', 'final', undefined);
  handleFailedImport(undefined, new Error('orphan'));
  await new Promise((resolve) => setImmediate(resolve));
});

it('runs a scan job, and marks a scan failed when no retry is left', async () => {
  await processImportJob(scanJob(0));
  expect(runScan).toHaveBeenCalledWith('d', 'f.zip', undefined);
  expect(runImport).not.toHaveBeenCalled();

  handleFailedImport(scanJob(3), new Error('not a zip'));
  expect(markScanFailed).toHaveBeenCalledWith('d', 'f.zip', 'not a zip', undefined);
  expect(markImportFailed).not.toHaveBeenCalled();
});

it('runs a delete job, and leaves a failed one marked for the startup sweep', async () => {
  const deleteJob = {
    name: 'delete',
    data: { datasetId: 'd' },
    attemptsMade: 0,
    opts: { attempts: 3 }
  } as unknown as Job<ImportJobData>;
  await processImportJob(deleteJob);
  expect(runDelete).toHaveBeenCalledWith('d');
  expect(runImport).not.toHaveBeenCalled();

  handleFailedImport(
    { ...deleteJob, attemptsMade: 3 } as unknown as Job<ImportJobData>,
    new Error('file-service down')
  );
  expect(markImportFailed).not.toHaveBeenCalled();
  expect(markScanFailed).not.toHaveBeenCalled();
});

it('runs a group removal job, and leaves a failed one marked', async () => {
  const removeJob = {
    name: 'remove-group',
    data: { datasetId: 'd', group: 'lidar' },
    attemptsMade: 3,
    opts: { attempts: 3 }
  } as unknown as Job<ImportJobData>;
  await processImportJob(removeJob);
  expect(runRemoveGroup).toHaveBeenCalledWith('d', 'lidar');
  handleFailedImport(removeJob, new Error('down'));
  expect(markImportFailed).not.toHaveBeenCalled();
});
