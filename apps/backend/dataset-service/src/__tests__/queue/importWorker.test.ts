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

import type { Job } from 'bullmq';
import { createImportWorker, handleFailedImport, processImportJob, willRetry } from '../../queue/importWorker';
import { IMPORT_QUEUE_NAME, ImportJobData } from '../../queue/importQueue';
import { markImportFailed, runImport } from '../../services/importService';
import { NonRetryableImportError } from '../../utils/boundedZip';

const job = (attemptsMade: number, attempts = 3) =>
  ({ data: { datasetId: 'd', importId: 'i' }, attemptsMade, opts: { attempts } }) as unknown as Job<ImportJobData>;

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
