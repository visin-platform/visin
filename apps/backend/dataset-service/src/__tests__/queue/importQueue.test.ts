const add = jest.fn();
const getJob = jest.fn();
const close = jest.fn();
const queueConstructor = jest.fn(() => ({ add, getJob, close }));

jest.mock('bullmq', () => ({ Queue: queueConstructor }));
jest.mock('../../queue/connection', () => ({ createRedisConnection: jest.fn(() => 'REDIS') }));

import { closeImportQueue, enqueueDelete, enqueueRemoveGroup, enqueueImport, enqueueScan, getImportQueue, IMPORT_QUEUE_NAME, removeQueuedImport } from '../../queue/importQueue';

beforeEach(async () => {
  jest.clearAllMocks();
  await closeImportQueue();
});

it('creates the queue once, on first use', () => {
  expect(queueConstructor).not.toHaveBeenCalled();
  expect(getImportQueue()).toBe(getImportQueue());
  expect(queueConstructor).toHaveBeenCalledWith(IMPORT_QUEUE_NAME, { connection: 'REDIS' });
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
});

it('queues reading a zip as its own kind of job', async () => {
  await enqueueScan({ datasetId: 'd', fileId: 'f.zip' });
  expect(add).toHaveBeenCalledWith('scan', { datasetId: 'd', fileId: 'f.zip' }, expect.objectContaining({ attempts: 3 }));
});

it('queues one deletion per dataset, however often it is asked for', async () => {
  await enqueueDelete({ datasetId: 'd' });
  expect(add).toHaveBeenCalledWith('delete', { datasetId: 'd' }, expect.objectContaining({ jobId: 'delete-d' }));
});

it('queues one removal per group, with a job id safe for any group name', async () => {
  await enqueueRemoveGroup({ datasetId: 'd', group: 'a:b' });
  expect(add).toHaveBeenCalledWith('remove-group', { datasetId: 'd', group: 'a:b' }, expect.objectContaining({ jobId: 'remove-group-d-613a62' }));
});
