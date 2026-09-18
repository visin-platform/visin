class FakeUnrecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecoverableError';
  }
}

const on = jest.fn();
const workerConstructor = jest.fn(() => ({ on }));

jest.mock('bullmq', () => ({ Worker: workerConstructor, UnrecoverableError: FakeUnrecoverableError }));
jest.mock('../../queue/connection', () => ({ createRedisConnection: jest.fn(() => 'REDIS') }));
jest.mock('../../services/importService', () => ({ runImport: jest.fn(), markImportFailed: jest.fn() }));
jest.mock('../../services/scanService', () => ({ runScan: jest.fn(), markScanFailed: jest.fn(() => Promise.resolve()) }));

import type { Job } from 'bullmq';
import { createImportWorker, handleFailedImport, processImportJob, willRetry } from '../../queue/importWorker';
import { IMPORT_QUEUE_NAME, ImportJobData } from '../../queue/importQueue';
import { markImportFailed, runImport } from '../../services/importService';
import { markScanFailed, runScan } from '../../services/scanService';
import { NonRetryableImportError } from '../../utils/boundedZip';

const job = (attemptsMade: number, attempts = 3) =>
  ({ name: 'import', data: { datasetId: 'd', importId: 'i' }, attemptsMade, opts: { attempts } }) as unknown as Job<ImportJobData>;
const scanJob = (attemptsMade: number) =>
  ({ name: 'scan', data: { datasetId: 'd', fileId: 'f.zip' }, attemptsMade, opts: { attempts: 3 } }) as unknown as Job<ImportJobData>;

beforeEach(() => jest.clearAllMocks());

it('registers a worker on the import queue', () => {
  createImportWorker();
  expect(workerConstructor).toHaveBeenCalledWith(IMPORT_QUEUE_NAME, processImportJob, expect.objectContaining({ connection: 'REDIS', concurrency: 1 }));
  expect(on).toHaveBeenCalledWith('failed', handleFailedImport);
  const errorHandler = on.mock.calls.find(([event]) => event === 'error')[1];
  errorHandler(new Error('redis down'));
});

it('runs the import and turns a bad archive into an unrecoverable failure', async () => {
  await processImportJob(job(0));
  expect(runImport).toHaveBeenCalledWith('d', 'i');

  jest.mocked(runImport).mockRejectedValueOnce(new NonRetryableImportError('too big'));
  await expect(processImportJob(job(0))).rejects.toBeInstanceOf(FakeUnrecoverableError);
  jest.mocked(runImport).mockRejectedValueOnce(new Error('transient'));
  await expect(processImportJob(job(0))).rejects.toThrow('transient');
});

it('marks the import failed only when no retry is left', async () => {
  expect(willRetry(job(1), new Error('x'))).toBe(true);
  expect(willRetry(job(3), new Error('x'))).toBe(false);
  expect(willRetry(job(1), new FakeUnrecoverableError('x'))).toBe(false);

  handleFailedImport(job(1), new Error('x'));
  expect(markImportFailed).not.toHaveBeenCalled();
  jest.mocked(markImportFailed).mockRejectedValueOnce(new Error('mongo down'));
  handleFailedImport(job(3), new Error('final'));
  expect(markImportFailed).toHaveBeenCalledWith('d', 'i', 'final');
  handleFailedImport(undefined, new Error('orphan'));
  await new Promise((resolve) => setImmediate(resolve));
});

it('runs a scan job, and marks a scan failed when no retry is left', async () => {
  await processImportJob(scanJob(0));
  expect(runScan).toHaveBeenCalledWith('d', 'f.zip');
  expect(runImport).not.toHaveBeenCalled();

  handleFailedImport(scanJob(3), new Error('not a zip'));
  expect(markScanFailed).toHaveBeenCalledWith('d', 'f.zip', 'not a zip');
  expect(markImportFailed).not.toHaveBeenCalled();
});
