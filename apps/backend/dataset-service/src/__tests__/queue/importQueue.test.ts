const add = jest.fn();
const getJob = jest.fn();
const close = jest.fn(async () => undefined);
const on = jest.fn();
const disconnect = jest.fn();
const queueConstructor = jest.fn(() => ({ add, getJob, close, on }));

jest.mock('bullmq', () => ({ Queue: queueConstructor }));
jest.mock('../../queue/connection', () => ({ createRedisConnection: jest.fn(() => ({ disconnect })) }));
jest.mock('../../queue/constants', () => ({ IMPORT_ATTEMPTS: 3, IMPORT_BACKOFF_MS: 5000, QUEUE_TIMEOUT_MS: 20 }));

import { closeImportQueue, enqueueDelete, enqueueRemoveGroup, enqueueImport, enqueueScan, getDatasetJob, getDatasetJobState, getImportQueue, IMPORT_QUEUE_NAME, removeQueuedImport, scanJobId } from '../../queue/importQueue';
import { createRedisConnection } from '../../queue/connection';
import { ServiceUnavailableError } from '@visin/backend-core';
import type { Job } from 'bullmq';

beforeEach(async () => {
  jest.clearAllMocks();
  await closeImportQueue();
  getJob.mockReset();
  add.mockReset();
});

it('creates the queue once, on first use', () => {
  expect(queueConstructor).not.toHaveBeenCalled();
  expect(getImportQueue()).toBe(getImportQueue());
  expect(queueConstructor).toHaveBeenCalledWith(IMPORT_QUEUE_NAME, { connection: { disconnect } });
  expect(createRedisConnection).toHaveBeenCalledWith('producer');
  on.mock.calls[0][1](new Error('Redis unavailable'));
});

it('uses the import id as the job id, so a double submit is a no-op', async () => {
  await enqueueImport({ datasetId: 'd', importId: 'i' });
  expect(add).toHaveBeenCalledWith('import', { datasetId: 'd', importId: 'i' }, expect.objectContaining({ jobId: 'i', attempts: 3 }));
});

it('removes a queued job and tolerates one that already left', async () => {
  const remove = jest.fn().mockRejectedValue(new Error('locked'));
  getJob.mockResolvedValueOnce({ remove }).mockResolvedValueOnce(undefined);
  await removeQueuedImport('i');
  await removeQueuedImport('gone');
  expect(remove).toHaveBeenCalled();
});

it('closes the queue it opened', async () => {
  getImportQueue();
  await closeImportQueue();
  expect(close).toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalled();
});

it('queues reading a zip as its own kind of job', async () => {
  await enqueueScan({ datasetId: 'd', fileId: 'f.zip' });
  expect(add).toHaveBeenCalledWith('scan', { datasetId: 'd', fileId: 'f.zip' }, expect.objectContaining({ attempts: 3, jobId: scanJobId({ datasetId: 'd', fileId: 'f.zip' }) }));
});

it('uses independent delivery identities for rescans and resumed imports', async () => {
  await enqueueScan({ datasetId: 'd', fileId: 'f.zip', scanId: 'new-scan' });
  expect(add).toHaveBeenLastCalledWith('scan', expect.anything(), expect.objectContaining({ jobId: 'scan-d-new-scan' }));
  await enqueueImport({ datasetId: 'd', importId: 'i', deliveryId: 'resume' });
  expect(add).toHaveBeenLastCalledWith('import', expect.anything(), expect.objectContaining({ jobId: 'resume' }));
});

it.each(['failed', 'completed'] as const)('retries a retained %s removal with a fresh attempt budget', async (state) => {
  const retry = jest.fn();
  getJob.mockResolvedValueOnce({ getState: jest.fn(async () => state), retry });
  await enqueueDelete({ datasetId: 'd' });
  expect(retry).toHaveBeenCalledWith(state, { resetAttemptsMade: true, resetAttemptsStarted: true });
  expect(add).not.toHaveBeenCalled();
});

it.each(['waiting', 'active', 'delayed'])('leaves a %s removal alone', async (state) => {
  const retry = jest.fn();
  getJob.mockResolvedValueOnce({ getState: jest.fn(async () => state), retry });
  await enqueueDelete({ datasetId: 'd' });
  expect(retry).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
});

it('handles a concurrent retry or removal between state lookup and retry', async () => {
  const retry = jest.fn().mockRejectedValue(new Error('already retried'));
  const getState = jest.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('active');
  getJob.mockResolvedValueOnce({ getState, retry });
  await enqueueDelete({ datasetId: 'd' });
  expect(add).not.toHaveBeenCalled();
  getJob.mockResolvedValueOnce({ getState: jest.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('unknown'), retry });
  await enqueueDelete({ datasetId: 'd' });
  expect(add).toHaveBeenCalledTimes(1);
});

it('reports queue failures as availability errors and discards the failed connection', async () => {
  add.mockRejectedValueOnce(new Error('connection lost'));
  await expect(enqueueImport({ datasetId: 'd', importId: 'i' })).rejects.toBeInstanceOf(ServiceUnavailableError);
  expect(disconnect).toHaveBeenCalled();
  await enqueueImport({ datasetId: 'd', importId: 'i' });
  expect(queueConstructor).toHaveBeenCalledTimes(2);
});

it('bounds initialization waits even before an ioredis command starts', async () => {
  add.mockImplementationOnce(() => new Promise(() => undefined));
  await expect(enqueueImport({ datasetId: 'd', importId: 'i' })).rejects.toMatchObject({ statusCode: 503 });
  expect(disconnect).toHaveBeenCalled();
});

it('does not hide a retry failure while the job remains failed', async () => {
  getJob.mockResolvedValueOnce({ getState: jest.fn(async () => 'failed'), retry: jest.fn().mockRejectedValue(new Error('unavailable')) });
  await expect(enqueueDelete({ datasetId: 'd' })).rejects.toMatchObject({ statusCode: 503 });
});

it('keeps the availability error when closing a failed connection also fails', async () => {
  add.mockRejectedValueOnce(new Error('connection lost'));
  close.mockRejectedValueOnce(new Error('close failed'));
  await expect(enqueueImport({ datasetId: 'd', importId: 'i' })).rejects.toMatchObject({ statusCode: 503 });
  await closeImportQueue();
});

it('does not discard a successor queue when an older request fails late', async () => {
  let failOlder: (error: Error) => void = () => undefined;
  add.mockImplementationOnce(() => new Promise((_resolve, reject) => { failOlder = reject; }));
  const older = enqueueImport({ datasetId: 'd', importId: 'old' }).catch((error: unknown) => error);
  add.mockRejectedValueOnce(new Error('disconnect'));
  await expect(enqueueImport({ datasetId: 'd', importId: 'other' })).rejects.toMatchObject({ statusCode: 503 });
  await enqueueImport({ datasetId: 'd', importId: 'new' });
  const successor = getImportQueue();
  const disconnects = disconnect.mock.calls.length;
  failOlder(new Error('late failure'));
  expect(await older).toBeInstanceOf(ServiceUnavailableError);
  expect(getImportQueue()).toBe(successor);
  expect(disconnect).toHaveBeenCalledTimes(disconnects);
});

it('recreates a job removed between lookup and reading its state', async () => {
  getJob.mockResolvedValueOnce({ getState: jest.fn(async () => 'unknown') });
  await enqueueDelete({ datasetId: 'd' });
  expect(add).toHaveBeenCalledTimes(1);
});

it('reads job state through the bounded queue boundary', async () => {
  const job = { getState: jest.fn(async () => 'waiting') } as unknown as Job;
  getJob.mockResolvedValueOnce(job);
  expect(await getDatasetJob('i')).toBe(job);
  expect(await getDatasetJobState(job)).toBe('waiting');
});

it('queues one deletion per dataset, however often it is asked for', async () => {
  await enqueueDelete({ datasetId: 'd' });
  expect(add).toHaveBeenCalledWith('delete', { datasetId: 'd' }, expect.objectContaining({ jobId: 'delete-d' }));
});

it('queues one removal per group, with a job id safe for any group name', async () => {
  await enqueueRemoveGroup({ datasetId: 'd', group: 'a:b' });
  expect(add).toHaveBeenCalledWith('remove-group', { datasetId: 'd', group: 'a:b' }, expect.objectContaining({ jobId: 'remove-group-d-613a62' }));
});
