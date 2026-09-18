import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, optionalAuth } from '@visin/backend-core';
import { checkMembership, getMyGroups } from '../../clients/groupServiceClient';
import { enqueueImport, removeQueuedImport } from '../../queue/importQueue';
import { Dataset } from '../../models/Dataset';
import { DatasetItem } from '../../models/DatasetItem';
import datasetRoutes from '../../routes/datasetRoutes';
import internalRoutes from '../../routes/internalRoutes';
import { fileStore } from '../fixtures/fileStore';
import { zip } from '../fixtures/zip';

jest.mock('../../clients/fileServiceClient', () => jest.requireActual('../fixtures/fileStore').fileStore.client);
jest.mock('../../clients/groupServiceClient', () => ({ checkMembership: jest.fn(), getMyGroups: jest.fn() }));
jest.mock('../../queue/importQueue', () => ({ enqueueImport: jest.fn(), removeQueuedImport: jest.fn() }));

const OWNER = '000000000000000000000001';
const MEMBER = '000000000000000000000002';
const ADMIN = '000000000000000000000003';
const STRANGER = '000000000000000000000004';
const GROUP = '0000000000000000000000aa';
const secret = 'dataset-service-test-secret';
const internalToken = 'internal-test-token';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const saved = { jwt: process.env.JWT_SECRET, internal: process.env.INTERNAL_SERVICE_TOKEN };

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  process.env.INTERNAL_SERVICE_TOKEN = internalToken;
  mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
  await mongoose.connect(mongo.getUri());
  await DatasetItem.syncIndexes();
  const app = express();
  app.use(express.json());
  app.use('/internal', internalRoutes);
  app.use('/api/datasets', optionalAuth, datasetRoutes);
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

beforeEach(async () => {
  await mongoose.connection.collection('users').insertMany(
    [OWNER, MEMBER, ADMIN, STRANGER].map((id) => ({ _id: new mongoose.Types.ObjectId(id), email: `${id}@example.test`, tokenVersion: 1 }))
  );
  jest.mocked(checkMembership).mockImplementation(async (_groupId, userId) =>
    userId === MEMBER ? { member: true, role: 'member' } : userId === ADMIN ? { member: true, role: 'admin' } : { member: false, role: null }
  );
  jest.mocked(getMyGroups).mockImplementation(async (userId) =>
    userId === MEMBER || userId === ADMIN ? [{ groupId: GROUP, name: 'Team', role: 'member' }] : []
  );
});

afterEach(async () => {
  jest.clearAllMocks();
  fileStore.stored.clear();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  process.env.JWT_SECRET = saved.jwt;
  process.env.INTERNAL_SERVICE_TOKEN = saved.internal;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
});

const tokenFor = (userId: string) => {
  const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, email: `${userId}@example.test`, tokenVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response shapes vary per route; each assertion names what it reads
type Body = { data?: any; message?: string };

const call = async (path: string, { method = 'GET', user, body, internal }: { method?: string; user?: string; body?: unknown; internal?: boolean } = {}) => {
  const headers: Record<string, string> = {};
  if (user) headers.Authorization = `Bearer ${tokenFor(user)}`;
  if (internal) headers['x-internal-token'] = internalToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
};

const createDataset = async (body: Record<string, unknown> = { name: 'Public set' }, user = OWNER) => {
  const response = await call('/api/datasets', { method: 'POST', user, body });
  expect(response.status).toBe(201);
  return response.body.data._id as string;
};

const uploadZip = async (id: string, entries: { path: string; data: Buffer }[]) => {
  const reserved = await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.zip' } });
  expect(reserved.status).toBe(201);
  const fileId = reserved.body.data.uploadUrl.replace('upload:', '');
  fileStore.stored.set(fileId, zip(entries));
  return { fileId, completed: await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER }) };
};

describe('visibility', () => {
  it('shows public datasets to everyone and group datasets to the group only', async () => {
    const publicId = await createDataset();
    const groupId = await createDataset({ name: 'Team set', visibility: 'group', groupId: GROUP }, MEMBER);

    const names = async (user?: string) =>
      ((await call('/api/datasets', { user })).body.data.datasets as { name: string }[]).map((row) => row.name).sort();
    expect(await names()).toEqual(['Public set']);
    expect(await names(STRANGER)).toEqual(['Public set']);
    expect(await names(MEMBER)).toEqual(['Public set', 'Team set']);

    expect((await call(`/api/datasets/${publicId}`)).status).toBe(200);
    expect((await call(`/api/datasets/${groupId}`)).status).toBe(401);
    expect((await call(`/api/datasets/${groupId}`, { user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${groupId}`, { user: MEMBER })).body.data).toMatchObject({ canWrite: true, visibility: 'group' });
    expect((await call('/api/datasets/not-an-id')).status).toBe(404);
    expect((await call(`/api/datasets?search=team`, { user: MEMBER })).body.data.pagination.total).toBe(1);
  });

  it('lets the uploader and group admins change a dataset, nobody else', async () => {
    const id = await createDataset({ name: 'Team set', visibility: 'group', groupId: GROUP }, MEMBER);
    expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: STRANGER, body: { name: 'x' } })).status).toBe(403);
    expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: ADMIN, body: { description: 'by admin' } })).status).toBe(200);
    expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: MEMBER, body: { name: 'Renamed', visibility: 'public' } })).body.data)
      .toMatchObject({ name: 'Renamed', description: 'by admin', visibility: 'public' });
    expect((await Dataset.findById(id).lean())?.groupId).toBeUndefined();
    expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: ADMIN, body: { name: 'y' } })).status).toBe(403);
  });

  it('lists the groups a dataset can be shared with', async () => {
    expect((await call('/api/datasets/groups')).status).toBe(401);
    expect((await call('/api/datasets/groups', { user: MEMBER })).body.data).toEqual([{ id: GROUP, name: 'Team', role: 'member' }]);
  });

  it('validates creation', async () => {
    expect((await call('/api/datasets', { method: 'POST', body: { name: 'x' } })).status).toBe(401);
    expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: '' } })).status).toBe(400);
    expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'x', visibility: 'group' } })).status).toBe(400);
    expect((await call('/api/datasets', { method: 'POST', user: STRANGER, body: { name: 'x', visibility: 'group', groupId: GROUP } })).status).toBe(403);
  });
});

describe('archive upload, download and import', () => {
  it('reads the zip index on completion and replaces a previous archive', async () => {
    const id = await createDataset();
    expect((await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.tar' } })).status).toBe(400);
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(400);
    expect((await call(`/api/datasets/${id}/download`)).status).toBe(400);

    const first = await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }, { path: 'lidar/1.bin', data: Buffer.alloc(10) }]);
    expect(first.completed.status).toBe(200);
    expect(first.completed.body.data.contents).toMatchObject({ entries: 2, totalBytes: 11 });
    expect(first.completed.body.data.archive).toMatchObject({ filename: 'set.zip' });

    const second = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('y') }]);
    expect(second.completed.status).toBe(200);
    expect(fileStore.stored.has(first.fileId)).toBe(false);
    expect((await call(`/api/datasets/${id}/download`)).body.data.downloadUrl).toBe(`signed:${second.fileId}`);
  });

  it('scans a zip that is already stored — what a migrated dataset starts with', async () => {
    const id = await createDataset();
    expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER })).status).toBe(400);

    const fileId = `label-bundles/${id}/upload.zip`;
    fileStore.stored.set(fileId, zip([{ path: 'frames/1.png', data: Buffer.from('xy') }]));
    await Dataset.updateOne({ _id: id }, { $set: { archive: { fileId, filename: 'upload.zip', uploadedAt: new Date() } } });
    expect((await call(`/api/datasets/${id}`)).body.data.archive).not.toHaveProperty('size');

    expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: STRANGER })).status).toBe(403);
    const scanned = await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER });
    expect(scanned.status).toBe(200);
    expect(scanned.body.data.archive.size).toBeGreaterThan(0);
    expect(scanned.body.data.contents).toMatchObject({ entries: 1, totalBytes: 2 });
  });

  it('refuses an upload that never arrived or is not a zip', async () => {
    const id = await createDataset();
    const reserved = await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.zip' } });
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(400);
    fileStore.stored.set(reserved.body.data.uploadUrl.replace('upload:', ''), Buffer.from('definitely not a zip file'));
    const completed = await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER });
    expect(completed.status).toBe(400);
    expect(completed.body.message).toContain('not a readable zip');
  });

  it('queues, refuses a second, and cancels an import', async () => {
    const id = await createDataset();
    const mapping = { groups: [{ folder: 'frames/', group: 'frames' }] };
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: mapping })).status).toBe(400);
    await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: { groups: [] } })).status).toBe(400);
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: { groups: [{ folder: 'a', group: 'x' }, { folder: 'a/', group: 'y' }] } })).status).toBe(400);

    const started = await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: mapping });
    expect(started.status).toBe(202);
    expect(started.body.data.import).toMatchObject({ status: 'queued', mapping: { groups: [{ folder: 'frames', group: 'frames' }] } });
    expect(enqueueImport).toHaveBeenCalledWith({ datasetId: id, importId: started.body.data.import.id });
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: mapping })).status).toBe(409);
    expect((await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'b.zip' } })).status).toBe(409);

    const cancelled = await call(`/api/datasets/${id}/import`, { method: 'DELETE', user: OWNER });
    expect(cancelled.body.data.import.status).toBe('cancelled');
    expect(removeQueuedImport).toHaveBeenCalledWith(started.body.data.import.id);
    expect((await call(`/api/datasets/${id}/import`, { method: 'DELETE', user: OWNER })).status).toBe(409);
  });

  it('retries an import whose process died', async () => {
    const id = await createDataset();
    await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    await Dataset.updateOne({ _id: id }, { $set: { import: { id: 'dead', status: 'running', heartbeatAt: new Date(Date.now() - 3600_000), mapping: { groups: [] }, archiveFileId: 'x', processed: 0, skipped: 0, errors: [] } } });
    const started = await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: { groups: [{ folder: '', group: 'all' }], manifest: './m.csv' } });
    expect(started.status).toBe(202);
    expect(removeQueuedImport).toHaveBeenCalledWith('dead');
    expect(started.body.data.import.mapping.manifest).toBe('m.csv');
  });
});

describe('holds', () => {
  it('protects a dataset a labeling job uses until the hold is released', async () => {
    const id = await createDataset();
    const { fileId } = await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT' })).status).toBe(401);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT', internal: true })).status).toBe(204);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT', internal: true })).status).toBe(204);
    expect((await call(`/api/datasets/${id}`)).body.data.usedBy).toBe(1);

    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER })).status).toBe(409);
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: { groups: [{ folder: '', group: 'all' }] } })).status).toBe(409);
    expect((await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'b.zip' } })).status).toBe(409);

    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'DELETE', internal: true })).status).toBe(204);
    await DatasetItem.create({ datasetId: id, group: 'g', path: 'p.png', stem: 'p', kind: 'image', size: 1 });
    await Dataset.updateOne({ _id: id }, { $set: { 'import.id': 'i', 'import.status': 'queued' } });
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER })).status).toBe(200);
    expect(removeQueuedImport).toHaveBeenCalledWith('i');
    expect(fileStore.stored.has(fileId)).toBe(false);
    expect(await DatasetItem.countDocuments({ datasetId: id })).toBe(0);
    expect((await call(`/api/datasets/${id}`)).status).toBe(404);
  });
});

describe('items', () => {
  let id: string;
  beforeEach(async () => {
    id = await createDataset();
    const datasetId = new mongoose.Types.ObjectId(id);
    await DatasetItem.create([
      { datasetId, group: 'frames', path: 'frames/0001.jpg', stem: '0001', kind: 'image', size: 1, fileId: 'f1', thumbnailFileId: 't1' },
      { datasetId, group: 'frames', path: 'frames/0002.jpg', stem: '0002', kind: 'image', size: 1, fileId: 'f2', thumbnailFileId: 't2' },
      { datasetId, group: 'verify', path: 'verify/0001.ids.png', stem: '0001', variant: 'ids', kind: 'image', size: 1, fileId: 'i1' },
      { datasetId, group: 'verify', path: 'verify/0001.masks.json', stem: '0001', variant: 'masks', kind: 'json', size: 1, data: [{ id: 1, class: 'car', quality: 'good' }, { id: 2, class: 'car', quality: 'bad' }] },
      { datasetId, group: 'verify', path: 'verify/0002.masks.json', stem: '0002', variant: 'masks', kind: 'json', size: 1, data: [{ id: 1, class: 'bus', score: { nested: 1 } }] }
    ]);
    await Dataset.updateOne({ _id: id }, { $set: { manifest: [{ stem: '0001', attributes: { stratum: 'day' } }] } });
  });

  it('pages thumbnails, filters, and includes JSON only for one stem', async () => {
    const frames = await call(`/api/datasets/${id}/items?group=frames&limit=1`);
    expect(frames.body.data.items).toEqual([expect.objectContaining({ path: 'frames/0001.jpg', thumbnailUrl: 'signed:t1' })]);
    expect(frames.body.data.items[0]).not.toHaveProperty('url');
    expect(frames.body.data.pagination).toMatchObject({ total: 2, pages: 2 });

    const stem = await call(`/api/datasets/${id}/items?stem=0001`);
    expect(stem.body.data.items.map((item: { path: string }) => item.path)).toEqual(['frames/0001.jpg', 'verify/0001.ids.png', 'verify/0001.masks.json']);
    expect(stem.body.data.items[0].url).toBe('signed:f1');
    expect(stem.body.data.items[1].thumbnailUrl).toBe('signed:i1');
    expect(stem.body.data.items[2].data).toHaveLength(2);

    expect((await call(`/api/datasets/${id}/items?search=0002&kind=image`)).body.data.items).toHaveLength(1);
    const listed = (await call(`/api/datasets/${id}/items?kind=json`)).body.data.items;
    expect(listed[0].data).toBeUndefined();

    const one = await call(`/api/datasets/${id}/items/${stem.body.data.items[2]._id}`);
    expect(one.body.data.data).toHaveLength(2);
    expect((await call(`/api/datasets/${id}/items/nope`)).status).toBe(404);
  });

  it('serves label-service: summaries, keyset pages, JSON field tallies and the manifest', async () => {
    expect((await call('/internal/datasets')).status).toBe(401);
    const listed = await call(`/internal/datasets?userId=${STRANGER}`, { internal: true });
    expect(listed.body.data.map((row: { _id: string }) => row._id)).toEqual([id]);
    expect((await call(`/internal/datasets/${id}`, { internal: true })).body.data).toMatchObject({ name: 'Public set', holds: [] });

    const firstPage = await call(`/internal/datasets/${id}/items?limit=2`, { internal: true });
    expect(firstPage.body.data.items.map((item: { path: string }) => item.path)).toEqual(['frames/0001.jpg', 'frames/0002.jpg']);
    expect(firstPage.body.data.items[0].fileId).toBe('f1');
    const nextPage = await call(`/internal/datasets/${id}/items?limit=2&after=${encodeURIComponent(firstPage.body.data.next)}`, { internal: true });
    expect(nextPage.body.data.items.map((item: { path: string }) => item.path)).toEqual(['verify/0001.ids.png', 'verify/0001.masks.json']);

    const frames = await call(`/internal/datasets/${id}/items?group=frames&kind=image&noVariant=true`, { internal: true });
    expect(frames.body.data).toMatchObject({ next: null });
    expect(frames.body.data.items).toHaveLength(2);
    const masks = await call(`/internal/datasets/${id}/items?group=verify&variant=masks`, { internal: true });
    expect(masks.body.data.items[0].data).toHaveLength(2);

    const fields = await call(`/internal/datasets/${id}/json-fields?group=verify&variant=masks`, { internal: true });
    expect(fields.body.data).toEqual([
      { field: 'class', values: [{ value: 'car', count: 2 }, { value: 'bus', count: 1 }] },
      { field: 'quality', values: [{ value: 'good', count: 1 }, { value: 'bad', count: 1 }] }
    ]);
    expect((await call(`/internal/datasets/${id}/manifest`, { internal: true })).body.data).toEqual([{ stem: '0001', attributes: { stratum: 'day' } }]);
  });

  it('drops a field with too many distinct values from the tally', async () => {
    await DatasetItem.create({
      datasetId: id, group: 'wide', path: 'wide/a.json', stem: 'a', kind: 'json', size: 1,
      data: Array.from({ length: 45 }, (_, index) => ({ id: index, score: index, kind: 'x' }))
    });
    const fields = await call(`/internal/datasets/${id}/json-fields?group=wide`, { internal: true });
    expect(fields.body.data).toEqual([{ field: 'kind', values: [{ value: 'x', count: 45 }] }]);
  });
});
