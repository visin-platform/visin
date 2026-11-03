import { vi } from 'vitest';
const { queueConstructor, add, getJob, close, on, disconnect } = vi.hoisted(() => {
  const add = vi.fn();
  const getJob = vi.fn();
  const close = vi.fn(async function () {
    return undefined;
  });
  const on = vi.fn();
  const disconnect = vi.fn();
  const queueConstructor = vi.fn(function () {
    return { add, getJob, close, on };
  });
  return { queueConstructor, add, getJob, close, on, disconnect };
});

vi.mock('bullmq', async () => {
  const module = await (() => ({ Queue: queueConstructor }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../queue/connection', async () => {
  const module = await (() => ({
    createRedisConnection: vi.fn(function () {
      return { disconnect };
    })
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../queue/constants', async () => {
  const module = await (() => ({ IMPORT_ATTEMPTS: 3, IMPORT_BACKOFF_MS: 5000, QUEUE_TIMEOUT_MS: 20 }))();
  return Object.assign({ default: module }, module);
});

import {
  closeImportQueue,
  enqueueDelete,
  enqueueRemoveGroup,
  enqueueImport,
  enqueueScan,
  getDatasetJob,
  getDatasetJobState,
  getImportQueue,
  IMPORT_QUEUE_NAME,
  removeQueuedImport,
  scanJobId
} from '../../queue/importQueue';
import { createRedisConnection } from '../../queue/connection';
import { ServiceUnavailableError } from '@visin/backend-core';
import type { Job } from 'bullmq';

beforeEach(async () => {
  vi.clearAllMocks();
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
  expect(add).toHaveBeenCalledWith(
    'import',
    { datasetId: 'd', importId: 'i' },
    expect.objectContaining({ jobId: 'i', attempts: 3 })
  );
});

it('removes a queued job and tolerates one that already left', async () => {
  const remove = vi.fn().mockRejectedValue(new Error('locked'));
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
  expect(add).toHaveBeenCalledWith(
    'scan',
    { datasetId: 'd', fileId: 'f.zip' },
    expect.objectContaining({ attempts: 3, jobId: scanJobId({ datasetId: 'd', fileId: 'f.zip' }) })
  );
});

it('uses independent delivery identities for rescans and resumed imports', async () => {
  await enqueueScan({ datasetId: 'd', fileId: 'f.zip', scanId: 'new-scan' });
  expect(add).toHaveBeenLastCalledWith(
    'scan',
    expect.anything(),
    expect.objectContaining({ jobId: 'scan-d-new-scan' })
  );
  await enqueueImport({ datasetId: 'd', importId: 'i', deliveryId: 'resume' });
  expect(add).toHaveBeenLastCalledWith('import', expect.anything(), expect.objectContaining({ jobId: 'resume' }));
});

it.each(['failed', 'completed'] as const)(
  'retries a retained %s removal with a fresh attempt budget',
  async (state) => {
    const retry = vi.fn();
    getJob.mockResolvedValueOnce({
      getState: vi.fn(async function () {
        return state;
      }),
      retry
    });
    await enqueueDelete({ datasetId: 'd' });
    expect(retry).toHaveBeenCalledWith(state, { resetAttemptsMade: true, resetAttemptsStarted: true });
    expect(add).not.toHaveBeenCalled();
  }
);

it.each(['waiting', 'active', 'delayed'])('leaves a %s removal alone', async (state) => {
  const retry = vi.fn();
  getJob.mockResolvedValueOnce({
    getState: vi.fn(async function () {
      return state;
    }),
    retry
  });
  await enqueueDelete({ datasetId: 'd' });
  expect(retry).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
});

it('handles a concurrent retry or removal between state lookup and retry', async () => {
  const retry = vi.fn().mockRejectedValue(new Error('already retried'));
  const getState = vi.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('active');
  getJob.mockResolvedValueOnce({ getState, retry });
  await enqueueDelete({ datasetId: 'd' });
  expect(add).not.toHaveBeenCalled();
  getJob.mockResolvedValueOnce({
    getState: vi.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('unknown'),
    retry
  });
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
  add.mockImplementationOnce(function () {
    return new Promise(() => undefined);
  });
  await expect(enqueueImport({ datasetId: 'd', importId: 'i' })).rejects.toMatchObject({ statusCode: 503 });
  expect(disconnect).toHaveBeenCalled();
});

it('does not hide a retry failure while the job remains failed', async () => {
  getJob.mockResolvedValueOnce({
    getState: vi.fn(async function () {
      return 'failed';
    }),
    retry: vi.fn().mockRejectedValue(new Error('unavailable'))
  });
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
  add.mockImplementationOnce(function () {
    return new Promise((_resolve, reject) => {
      failOlder = reject;
    });
  });
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
  getJob.mockResolvedValueOnce({
    getState: vi.fn(async function () {
      return 'unknown';
    })
  });
  await enqueueDelete({ datasetId: 'd' });
  expect(add).toHaveBeenCalledTimes(1);
});

it('reads job state through the bounded queue boundary', async () => {
  const job = {
    getState: vi.fn(async function () {
      return 'waiting';
    })
  } as unknown as Job;
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
  expect(add).toHaveBeenCalledWith(
    'remove-group',
    { datasetId: 'd', group: 'a:b' },
    expect.objectContaining({ jobId: 'remove-group-d-613a62' })
  );
});
