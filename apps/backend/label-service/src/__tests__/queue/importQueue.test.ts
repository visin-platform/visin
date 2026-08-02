const queueInstance = {
  add: jest.fn(),
  getJob: jest.fn(),
  close: jest.fn()
};
const queueConstructor = jest.fn(() => queueInstance);

jest.mock('bullmq', () => ({ Queue: queueConstructor }));
jest.mock('../../queue/connection', () => ({ createRedisConnection: jest.fn(() => 'REDIS') }));

import { enqueueImport, removeQueuedImport, closeImportQueue, getImportQueue, IMPORT_QUEUE_NAME } from '../../queue/importQueue';
import { createRedisConnection } from '../../queue/connection';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(async () => {
  await closeImportQueue();
});

describe('getImportQueue', () => {
  it('opens one connection and reuses it', () => {
    const first = getImportQueue();
    const second = getImportQueue();

    expect(first).toBe(second);
    // One Redis connection per process, opened on demand rather than at import
    // time, so requiring this module in a test or a script stays offline.
    expect(createRedisConnection).toHaveBeenCalledTimes(1);
    expect(queueConstructor).toHaveBeenCalledTimes(1);
    expect(queueConstructor).toHaveBeenCalledWith(IMPORT_QUEUE_NAME, { connection: 'REDIS' });
  });
});

describe('enqueueImport', () => {
  it('keys the queue entry by the ImportJob id so a double-submit is a no-op', async () => {
    await enqueueImport({ importJobId: 'i1', bundleId: 'b1' });

    const [name, data, options] = queueInstance.add.mock.calls[0];
    expect(name).toBe('import');
    expect(data).toEqual({ importJobId: 'i1', bundleId: 'b1' });
    expect(options.jobId).toBe('i1');
  });

  it('retries a few times with exponential backoff', async () => {
    await enqueueImport({ importJobId: 'i1', bundleId: 'b1' });

    const options = queueInstance.add.mock.calls[0][2];
    expect(options.attempts).toBe(3);
    expect(options.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });
});

describe('removeQueuedImport', () => {
  it('removes a job that is still queued', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    queueInstance.getJob.mockResolvedValue({ remove });

    await removeQueuedImport('i1');

    expect(queueInstance.getJob).toHaveBeenCalledWith('i1');
    expect(remove).toHaveBeenCalled();
  });

  it('is a no-op when the job is already gone', async () => {
    queueInstance.getJob.mockResolvedValue(undefined);

    await expect(removeQueuedImport('i1')).resolves.toBeUndefined();
  });

  it('swallows a removal that loses the race with a worker picking the job up', async () => {
    queueInstance.getJob.mockResolvedValue({
      remove: jest.fn().mockRejectedValue(new Error('Job is locked'))
    });

    await expect(removeQueuedImport('i1')).resolves.toBeUndefined();
  });
});

describe('closeImportQueue', () => {
  it('closes an open queue and reopens on next use', async () => {
    getImportQueue();

    await closeImportQueue();
    getImportQueue();

    expect(queueInstance.close).toHaveBeenCalledTimes(1);
    expect(queueConstructor).toHaveBeenCalledTimes(2);
  });

  it('is safe when nothing was ever opened', async () => {
    await expect(closeImportQueue()).resolves.toBeUndefined();
    expect(queueInstance.close).not.toHaveBeenCalled();
  });
});
