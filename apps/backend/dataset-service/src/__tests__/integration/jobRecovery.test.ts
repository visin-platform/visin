import mongoose from 'mongoose';
import Redis from 'ioredis';
import { Worker, type Job } from 'bullmq';
import { MongoMemoryServer } from 'mongodb-memory-server';
import sharp from 'sharp';
import { logger, ServiceUnavailableError } from '@visin/backend-core';
import { Dataset, type DatasetImport } from '../../models/Dataset';
import { DatasetItem } from '../../models/DatasetItem';
import {
  closeImportQueue,
  enqueueDelete,
  enqueueImport,
  enqueueRemoveGroup,
  enqueueScan,
  getImportQueue,
  IMPORT_QUEUE_NAME,
  scanJobId,
  type DatasetJobData
} from '../../queue/importQueue';
import { createImportWorker, processImportJob } from '../../queue/importWorker';
import { createRedisConnection } from '../../queue/connection';
import { recoverDatasetJobs } from '../../services/jobRecoveryService';
import { startImport, resumeImport, rescanArchive } from '../../services/datasetService';
import { createDatasetAccess } from '../../services/accessService';
import { markImportFailed, runImport } from '../../services/importService';
import { markScanFailed, runScan } from '../../services/scanService';
import { fileStore } from '../fixtures/fileStore';
import { zip } from '../fixtures/zip';
import { startRedis } from '../fixtures/redis';

jest.mock('../../clients/fileServiceClient', () => jest.requireActual('../fixtures/fileStore').fileStore.client);
jest.mock('../../clients/ownerIdentityClient', () => ({ lookupOwnerIdentities: jest.fn(async () => new Map()) }));
jest.mock('../../clients/groupServiceClient', () => ({
  getMyGroups: jest.fn(async () => []),
  checkMembership: jest.fn()
}));
jest.mock('../../queue/constants', () => ({
  ...jest.requireActual('../../queue/constants'),
  IMPORT_BACKOFF_MS: 1,
  IMPORT_ATTEMPTS: 2,
  QUEUE_TIMEOUT_MS: 150
}));

jest.setTimeout(30_000);
let mongo: MongoMemoryServer;
let redis: Awaited<ReturnType<typeof startRedis>>;
let control: Redis;
let worker: Worker<DatasetJobData> | undefined;
let workerConnection: Redis | undefined;
let png: Buffer;
const originalRedis = process.env.REDIS_URL;

beforeAll(async () => {
  redis = await startRedis();
  process.env.REDIS_URL = redis.url;
  control = new Redis(redis.url);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await DatasetItem.syncIndexes();
  png = await sharp({ create: { width: 4, height: 2, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
});

afterEach(async () => {
  await worker?.close();
  worker = undefined;
  workerConnection?.disconnect();
  workerConnection = undefined;
  await closeImportQueue();
  await control.flushdb();
  fileStore.stored.clear();
  jest.clearAllMocks();
  await Promise.all([Dataset.deleteMany({}), DatasetItem.deleteMany({})]);
});

afterAll(async () => {
  await closeImportQueue();
  await control?.quit();
  await mongoose.disconnect();
  await mongo?.stop();
  await redis?.stop();
  if (originalRedis === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedis;
});

async function eventually(check: () => Promise<boolean>): Promise<void> {
  const until = Date.now() + 8000;
  while (!(await check())) {
    if (Date.now() > until) throw new Error('Queue recovery did not reach the expected outcome');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function dataset(extra: Record<string, unknown> = {}) {
  const _id = new mongoose.Types.ObjectId();
  const fileId = `datasets/${_id}/archives/a.zip`;
  fileStore.stored.set(fileId, zip([{ path: 'frames/1.png', data: png }]));
  return Dataset.create({
    _id,
    name: 'Recovery fixture',
    owner: { kind: 'user', id: 'owner' },
    createdBy: 'owner',
    storagePrefix: `datasets/${_id}/`,
    archive: { fileId, filename: 'a.zip', uploadedAt: new Date() },
    ...extra
  });
}

function importing(fileId: string, extra: Partial<DatasetImport> = {}): DatasetImport {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    archiveFileId: fileId,
    status: 'queued',
    mapping: { groups: [{ folder: 'frames', group: 'camera' }] },
    processed: 0,
    skipped: 0,
    errors: [],
    ...extra
  };
}

it('recovers a Mongo save without an enqueue once, even with concurrent reconcilers', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId);
  record.scan = { id: 'scan-1', fileId: record.archive!.fileId, status: 'queued' };
  await record.save(); // Simulate process exit between this write and queue.add().
  await Promise.all([recoverDatasetJobs(), recoverDatasetJobs()]);
  await recoverDatasetJobs();
  expect(await getImportQueue().getWaitingCount()).toBe(2);
  const processed = new Map<string, number>();
  workerConnection = createRedisConnection();
  worker = new Worker<DatasetJobData>(
    IMPORT_QUEUE_NAME,
    async (job) => {
      processed.set(job.id!, (processed.get(job.id!) ?? 0) + 1);
      await processImportJob(job);
    },
    { connection: workerConnection, stalledInterval: 100 }
  );
  await eventually(async () => {
    const current = await Dataset.findById(record._id).lean();
    return current?.import?.status === 'done' && current.scan?.status === 'done';
  });
  expect([...processed.values()]).toEqual([1, 1]);
  expect(await DatasetItem.countDocuments({ datasetId: record._id })).toBe(1);
});

it('starts only one import when requests race to persist and enqueue work', async () => {
  const record = await dataset();
  const access = createDatasetAccess('owner');
  const begin = () => startImport(access, record._id.toString(), { groups: [{ folder: 'frames', group: 'camera' }] });
  const outcomes = await Promise.allSettled([begin(), begin()]);
  expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
  expect(await getImportQueue().getWaitingCount()).toBe(1);
});

it('refuses an import if a labeling hold arrives after the request read its dataset', async () => {
  const record = await dataset();
  const claim = Dataset.collection.findOneAndUpdate.bind(Dataset.collection);
  const race = jest.spyOn(Dataset.collection, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
    await Dataset.updateOne(
      { _id: record._id },
      { $push: { holds: { service: 'label-service', ref: 'new-job', createdAt: new Date() } } }
    );
    return claim(...args);
  });
  try {
    await expect(
      startImport(createDatasetAccess('owner'), record._id.toString(), {
        groups: [{ folder: 'frames', group: 'camera' }]
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await getImportQueue().getWaitingCount()).toBe(0);
    expect((await Dataset.findById(record._id).lean())?.import).toBeUndefined();
  } finally {
    race.mockRestore();
  }
});

it('does not cancel a newer resumed delivery after reading an older running import', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId, { status: 'running' });
  await record.save();
  const access = createDatasetAccess('owner');
  const claim = Dataset.collection.findOneAndUpdate.bind(Dataset.collection);
  const race = jest.spyOn(Dataset.collection, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
    await Dataset.updateOne({ _id: record._id }, { $set: { 'import.status': 'failed' } });
    await resumeImport(access, record._id.toString());
    return claim(...args);
  });
  try {
    const { cancelImport } = await import('../../services/datasetService');
    await expect(cancelImport(access, record._id.toString())).rejects.toMatchObject({ statusCode: 409 });
    expect((await Dataset.findById(record._id).lean())?.import).toMatchObject({
      status: 'queued',
      deliveryId: expect.any(String)
    });
    expect(await getImportQueue().getWaitingCount()).toBe(1);
  } finally {
    race.mockRestore();
  }
});

it('leaves long-waiting and active deliveries alone regardless of heartbeat age', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId);
  await record.save();
  await enqueueImport({ datasetId: record._id.toString(), importId: record.import.id });
  await recoverDatasetJobs(new Date(Date.now() + 24 * 60 * 60_000));
  expect((await Dataset.findById(record._id).lean())?.import?.status).toBe('queued');
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  workerConnection = createRedisConnection();
  worker = new Worker(IMPORT_QUEUE_NAME, async () => gate, { connection: workerConnection, stalledInterval: 100 });
  try {
    await eventually(async () => (await getImportQueue().getActiveCount()) === 1);
    await recoverDatasetJobs(new Date(Date.now() + 24 * 60 * 60_000));
    expect((await Dataset.findById(record._id).lean())?.import?.status).toBe('queued');
    expect(await getImportQueue().getWaitingCount()).toBe(0);
  } finally {
    release();
  }
});

it('recovers lost Redis delivery and respects live running heartbeats', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId, { status: 'running', heartbeatAt: new Date() });
  record.scan = { id: 'scan-1', status: 'running', fileId: record.archive!.fileId, heartbeatAt: new Date() };
  await record.save();
  await enqueueImport({ datasetId: record._id.toString(), importId: record.import.id });
  await enqueueScan({ datasetId: record._id.toString(), fileId: record.scan.fileId, scanId: record.scan.id });
  await control.flushdb();
  await recoverDatasetJobs();
  expect((await Dataset.findById(record._id).lean())?.import?.status).toBe('running');
  expect(await getImportQueue().getWaitingCount()).toBe(0);
  await recoverDatasetJobs(new Date(Date.now() + 11 * 60_000));
  const failed = await Dataset.findById(record._id).lean();
  expect(failed?.import?.status).toBe('failed');
  expect(failed?.scan).toMatchObject({ status: 'failed', error: expect.stringContaining('rescan') });
  // Recovery leaves an explicit resume action, never a duplicate live processor.
  const access = createDatasetAccess('owner');
  await resumeImport(access, record._id.toString());
  await rescanArchive(access, record._id.toString());
  worker = createImportWorker({ stalledInterval: 100 });
  await eventually(async () => {
    const current = await Dataset.findById(record._id).lean();
    return current?.import?.status === 'done' && current.scan?.status === 'done';
  });
});

it.each(['delete', 'remove-group'])(
  'retries a retained failed %s job and completes after storage recovers',
  async (kind) => {
    const record = await dataset(kind === 'delete' ? { deletingAt: new Date() } : { removingGroups: ['camera'] });
    await DatasetItem.create({
      datasetId: record._id,
      group: 'camera',
      path: 'frames/1.png',
      stem: '1',
      kind: 'image',
      size: 1,
      fileId: 'fixture-image'
    });
    const method = kind === 'delete' ? fileStore.client.deleteFolder : fileStore.client.deleteFiles;
    const original = method.getMockImplementation()!;
    method.mockRejectedValue(new Error('file-service unavailable'));
    const data = { datasetId: record._id.toString() };
    const jobId = kind === 'delete' ? `delete-${data.datasetId}` : `remove-group-${data.datasetId}-63616d657261`;
    try {
      if (kind === 'delete') await enqueueDelete(data);
      else await enqueueRemoveGroup({ ...data, group: 'camera' });
      worker = createImportWorker({ stalledInterval: 100 });
      await eventually(
        async () => (await getImportQueue().getJob(jobId))?.getState().then((state) => state === 'failed') ?? false
      );
      expect((await getImportQueue().getJob(jobId))?.attemptsMade).toBe(2);
      method.mockImplementation(original);
      await Promise.all([recoverDatasetJobs(), recoverDatasetJobs()]);
      await eventually(async () =>
        kind === 'delete'
          ? (await Dataset.countDocuments({ _id: record._id })) === 0
          : (await Dataset.findById(record._id).lean())?.removingGroups?.length === 0
      );
      expect(await DatasetItem.countDocuments({ datasetId: record._id })).toBe(0);
      expect(await getImportQueue().getFailedCount()).toBe(0);
    } finally {
      method.mockImplementation(original);
    }
  }
);

it('persists work across a bounded Redis command timeout and delivers it after recovery', async () => {
  const record = await dataset();
  await getImportQueue().waitUntilReady();
  await control.call('CLIENT', 'PAUSE', '1000', 'ALL');
  const began = Date.now();
  await expect(
    startImport(createDatasetAccess('owner'), record._id.toString(), {
      groups: [{ folder: 'frames', group: 'camera' }]
    })
  ).rejects.toBeInstanceOf(ServiceUnavailableError);
  expect(Date.now() - began).toBeLessThan(800);
  expect((await Dataset.findById(record._id).lean())?.import?.status).toBe('queued');
  await control.ping();
  await recoverDatasetJobs();
  worker = createImportWorker({ stalledInterval: 100 });
  await eventually(async () => (await Dataset.findById(record._id).lean())?.import?.status === 'done');
});

it('bounds queue initialization while Redis is unreachable and reconnects on the next operation', async () => {
  process.env.REDIS_URL = 'redis://127.0.0.1:0';
  const began = Date.now();
  try {
    await expect(enqueueImport({ datasetId: 'd', importId: 'i' })).rejects.toMatchObject({ statusCode: 503 });
    expect(Date.now() - began).toBeLessThan(800);
  } finally {
    process.env.REDIS_URL = redis.url;
  }
  await enqueueImport({ datasetId: 'd', importId: 'i' });
  expect(await getImportQueue().getWaitingCount()).toBe(1);
});

it('cannot apply late completion/failure from an earlier scan or resumed import', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId, { deliveryId: 'resume-new' });
  record.scan = { id: 'scan-new', status: 'queued', fileId: record.archive!.fileId };
  await record.save();
  const datasetId = record._id.toString();
  await markImportFailed(datasetId, record.import.id, 'old failure');
  await markImportFailed(datasetId, record.import.id, 'old failure', 'resume-old');
  await markScanFailed(datasetId, record.scan.fileId, 'old failure');
  await markScanFailed(datasetId, record.scan.fileId, 'old failure', 'scan-old');
  await expect(runImport(datasetId, record.import.id, 'resume-old')).rejects.toThrow('superseded');
  await runScan(datasetId, record.scan.fileId, 'scan-old');
  const current = await Dataset.findById(record._id).lean();
  expect(current?.import).toMatchObject({ status: 'queued', deliveryId: 'resume-new', errors: [] });
  expect(current?.scan).toMatchObject({ status: 'queued', id: 'scan-new' });
  expect(fileStore.client.getFileStream).not.toHaveBeenCalled();
});

it('does not mark refreshed running work stale or overwrite a completed outcome', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId, { status: 'running', heartbeatAt: new Date() });
  record.scan = { id: 'scan-1', status: 'running', fileId: record.archive!.fileId, heartbeatAt: new Date() };
  await record.save();
  const cutoff = new Date(Date.now() - 600_000);
  await markImportFailed(record._id.toString(), record.import.id, 'stale', undefined, cutoff);
  await markScanFailed(record._id.toString(), record.scan.fileId, 'stale', record.scan.id, cutoff);
  expect((await Dataset.findById(record._id).lean())?.import?.status).toBe('running');
  await Dataset.updateOne({ _id: record._id }, { $set: { 'import.status': 'done', 'scan.status': 'done' } });
  await markImportFailed(record._id.toString(), record.import.id, 'late failure');
  await markScanFailed(record._id.toString(), record.scan.fileId, 'late failure', record.scan.id);
  expect((await Dataset.findById(record._id).lean())?.scan?.status).toBe('done');
});

it('makes retained terminal queue failures visible if their original Mongo update was lost', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId);
  record.scan = { id: 'scan-1', fileId: record.archive!.fileId, status: 'queued' };
  await record.save();
  await enqueueImport({ datasetId: record._id.toString(), importId: record.import.id });
  await enqueueScan({ datasetId: record._id.toString(), fileId: record.scan.fileId, scanId: record.scan.id });
  workerConnection = createRedisConnection();
  worker = new Worker(
    IMPORT_QUEUE_NAME,
    async () => {
      throw new Error('fixture terminal failure');
    },
    { connection: workerConnection, stalledInterval: 100 }
  );
  await eventually(async () => (await getImportQueue().getFailedCount()) === 2);
  await recoverDatasetJobs();
  const current = await Dataset.findById(record._id).lean();
  expect(current?.import).toMatchObject({
    status: 'failed',
    errors: [{ path: '(zip)', reason: 'fixture terminal failure' }]
  });
  expect(current?.scan).toMatchObject({ status: 'failed', error: 'fixture terminal failure' });
});

it('turns completed deliveries with no persisted outcome into an actionable failure', async () => {
  const record = await dataset();
  record.import = importing(record.archive!.fileId);
  record.scan = { id: 'scan-1', fileId: record.archive!.fileId, status: 'queued' };
  await record.save();
  await enqueueImport({ datasetId: record._id.toString(), importId: record.import.id });
  await enqueueScan({ datasetId: record._id.toString(), fileId: record.scan.fileId, scanId: record.scan.id });
  workerConnection = createRedisConnection();
  worker = new Worker(IMPORT_QUEUE_NAME, async (_job: Job) => undefined, {
    connection: workerConnection,
    stalledInterval: 100
  });
  await eventually(async () => (await getImportQueue().getCompletedCount()) === 2);
  await recoverDatasetJobs();
  expect((await Dataset.findById(record._id).lean())?.import?.status).toBe('failed');
  expect((await Dataset.findById(record._id).lean())?.scan?.error).toContain('completed');
});

it('identifies legacy queued scans before creating a replacement delivery', async () => {
  const record = await dataset();
  record.scan = { status: 'queued', fileId: record.archive!.fileId };
  await record.save();
  await recoverDatasetJobs();
  const current = await Dataset.findById(record._id).lean();
  expect(current?.scan?.id).toBeDefined();
  expect(
    await getImportQueue().getJob(
      scanJobId({ datasetId: record._id.toString(), fileId: record.scan.fileId, scanId: current!.scan!.id })
    )
  ).toBeDefined();
  await runScan(record._id.toString(), record.scan.fileId); // Anonymous old delivery is now fenced out.
  expect(fileStore.client.getFileRange).not.toHaveBeenCalled();
});

it('leaves a legacy scan that starts while its delivery identity is being assigned alone', async () => {
  const record = await dataset();
  record.scan = { status: 'queued', fileId: record.archive!.fileId };
  await record.save();
  const claim = jest.spyOn(Dataset.collection, 'findOneAndUpdate').mockImplementationOnce(async () => {
    await Dataset.updateOne(
      { _id: record._id },
      { $set: { 'scan.status': 'running', 'scan.heartbeatAt': new Date() } }
    );
    return null;
  });
  try {
    expect(await recoverDatasetJobs()).toBe(0);
    expect(await getImportQueue().getWaitingCount()).toBe(0);
    expect((await Dataset.findById(record._id).lean())?.scan?.status).toBe('running');
  } finally {
    claim.mockRestore();
  }
});

it('renews a slow scan heartbeat without overlapping writes and survives a transient renewal failure', async () => {
  const record = await dataset();
  record.scan = { id: 'slow-scan', status: 'queued', fileId: record.archive!.fileId };
  await record.save();
  let releaseRead: () => void = () => undefined;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const read = fileStore.client.getFileRange.getMockImplementation()!;
  fileStore.client.getFileRange.mockImplementationOnce(async (...args) => {
    await readGate;
    return read(...args);
  });
  const interval = global.setInterval;
  const clock = jest
    .spyOn(global, 'setInterval')
    .mockImplementation((callback, delay, ...args) => interval(callback, delay === 5000 ? 10 : delay, ...args));
  const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  const running = runScan(record._id.toString(), record.scan.fileId, record.scan.id);
  await eventually(async () => fileStore.client.getFileRange.mock.calls.length > 0);
  const firstBeat = (await Dataset.findById(record._id).lean())!.scan!.heartbeatAt!;
  const update = Dataset.collection.updateOne.bind(Dataset.collection);
  let releaseBeat: () => void = () => undefined;
  const renewal = jest.spyOn(Dataset.collection, 'updateOne').mockImplementationOnce(
    (...args) =>
      new Promise((resolve, reject) => {
        releaseBeat = () => {
          Promise.resolve(update(...args)).then(resolve, reject);
        };
      })
  );
  try {
    await eventually(async () => renewal.mock.calls.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(renewal).toHaveBeenCalledTimes(1);
    releaseBeat();
    await eventually(
      async () =>
        new Date((await Dataset.findById(record._id).lean())!.scan!.heartbeatAt!).getTime() >
        new Date(firstBeat).getTime()
    );
    renewal.mockRejectedValueOnce(new Error('temporary database outage'));
    await eventually(async () => warn.mock.calls.length > 0);
    expect(warn).toHaveBeenCalledWith('Could not renew dataset scan heartbeat', expect.anything());
    releaseRead();
    await running;
    expect((await Dataset.findById(record._id).lean())?.scan?.status).toBe('done');
  } finally {
    releaseBeat();
    releaseRead();
    await running;
    renewal.mockRestore();
    clock.mockRestore();
    warn.mockRestore();
  }
});

it('cannot publish a scan result after another rescan supersedes it', async () => {
  const record = await dataset();
  record.scan = { id: 'scan-old', status: 'queued', fileId: record.archive!.fileId };
  await record.save();
  const read = fileStore.client.getFileRange.getMockImplementation()!;
  fileStore.client.getFileRange.mockImplementationOnce(async (...args) => {
    await Dataset.updateOne({ _id: record._id }, { $set: { 'scan.id': 'scan-new', 'scan.status': 'queued' } });
    return read(...args);
  });
  await runScan(record._id.toString(), record.scan.fileId, record.scan.id);
  const current = await Dataset.findById(record._id).lean();
  expect(current?.scan).toMatchObject({ id: 'scan-new', status: 'queued' });
  expect(current?.contents).toBeUndefined();
});
