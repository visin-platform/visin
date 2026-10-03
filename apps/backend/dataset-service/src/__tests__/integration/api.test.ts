jest.mock('../../clients/projectServiceClient', () => ({ projectDatasetOwner: jest.fn(async () => ({ kind: 'user', id: '000000000000000000000001' })) }));
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadGatewayError, createApiKey, errorHandler, resetEncryptionKeyCache } from '@visin/backend-core';
import { projectDatasetOwner } from '../../clients/projectServiceClient';
import { datasetApiGuards } from '../../apiGuards';
import { checkMembership, getMyGroups, type GroupRole } from '../../clients/groupServiceClient';
import { enqueueDelete, enqueueImport, enqueueRemoveGroup, enqueueScan, removeQueuedImport } from '../../queue/importQueue';
import { resumeDeletions, runDelete, runRemoveGroup } from '../../services/deleteService';
import { markScanFailed, runScan } from '../../services/scanService';
import { NonRetryableImportError } from '../../utils/boundedZip';
import { fetchDatasetInfo } from '../../clients/hubClient';
import { clearHubCache } from '../../services/hubService';
import { Dataset } from '../../models/Dataset';
import { purgeExpiredTrash } from '../../services/datasetService';
import { DatasetItem } from '../../models/DatasetItem';
import datasetRoutes from '../../routes/datasetRoutes';
import internalRoutes from '../../routes/internalRoutes';
import { fileStore } from '../fixtures/fileStore';
import { zip } from '../fixtures/zip';

jest.mock('../../clients/fileServiceClient', () => jest.requireActual('../fixtures/fileStore').fileStore.client);
jest.mock('../../clients/hubClient', () => ({ fetchDatasetInfo: jest.fn() }));
jest.mock('../../clients/groupServiceClient', () => ({ checkMembership: jest.fn(), getMyGroups: jest.fn() }));
jest.mock('../../queue/importQueue', () => ({ enqueueImport: jest.fn(), enqueueScan: jest.fn(), enqueueDelete: jest.fn(), enqueueRemoveGroup: jest.fn(), removeQueuedImport: jest.fn() }));

const OWNER = '000000000000000000000001';
const MEMBER = '000000000000000000000002';
const ADMIN = '000000000000000000000003';
const STRANGER = '000000000000000000000004';
const GROUP_OWNER = '000000000000000000000005';
const GROUP = '0000000000000000000000aa';
const OTHER_GROUP = '0000000000000000000000bb';
/** Each user's role in GROUP; a test that removes someone deletes their entry. */
let roles: Record<string, GroupRole>;
/** Each user's role in OTHER_GROUP. */
let otherRoles: Record<string, GroupRole>;
const secret = 'dataset-service-test-secret';
const internalToken = 'internal-test-token';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const saved = { jwt: process.env.JWT_SECRET, internal: process.env.INTERNAL_SERVICE_TOKEN, encryption: process.env.API_KEY_ENCRYPTION_SECRET };

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  process.env.INTERNAL_SERVICE_TOKEN = internalToken;
  process.env.API_KEY_ENCRYPTION_SECRET = 'dataset-service-key-test-secret';
  resetEncryptionKeyCache();
  mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
  await mongoose.connect(mongo.getUri());
  await DatasetItem.syncIndexes();
  const app = express();
  app.use(express.json());
  app.use('/internal', internalRoutes);
  app.use('/api/datasets', ...datasetApiGuards, datasetRoutes);
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

beforeEach(async () => {
  jest.mocked(projectDatasetOwner).mockResolvedValue({ kind: 'user', id: OWNER });
  roles = { [MEMBER]: 'member', [ADMIN]: 'admin', [GROUP_OWNER]: 'owner' };
  await mongoose.connection.collection('users').insertMany(
    [OWNER, MEMBER, ADMIN, STRANGER, GROUP_OWNER].map((id) => ({ _id: new mongoose.Types.ObjectId(id), email: `${id}@example.test`, tokenVersion: 1 }))
  );
  // Each test token names a session whose id is its user's.
  await mongoose.connection.collection('user_sessions').insertMany((await mongoose.connection.collection('users').find({}, { projection: { _id: 1 } }).toArray()).map(({ _id }) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
  otherRoles = { [GROUP_OWNER]: 'member', [OWNER]: 'member' };
  const roleIn = (groupId: string, userId: string): GroupRole | undefined =>
    groupId === GROUP ? roles[userId] : groupId === OTHER_GROUP ? otherRoles[userId] : undefined;
  jest.mocked(checkMembership).mockImplementation(async (groupId, userId) => {
    const role = roleIn(groupId, userId);
    return role ? { member: true, role } : { member: false, role: null };
  });
  jest.mocked(getMyGroups).mockImplementation(async (userId) => [
    ...(roles[userId] ? [{ groupId: GROUP, name: 'Team', role: roles[userId] }] : []),
    ...(otherRoles[userId] ? [{ groupId: OTHER_GROUP, name: 'Other team', role: otherRoles[userId] }] : [])
  ]);
});

afterEach(async () => {
  jest.clearAllMocks();
  fileStore.stored.clear();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  process.env.JWT_SECRET = saved.jwt;
  process.env.INTERNAL_SERVICE_TOKEN = saved.internal;
  if (saved.encryption === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
  else process.env.API_KEY_ENCRYPTION_SECRET = saved.encryption;
  resetEncryptionKeyCache();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
});

const tokenFor = (userId: string) => {
  const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, email: `${userId}@example.test`, tokenVersion: 1, sid: userId, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
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

const createDataset = async (body: Record<string, unknown> = { name: 'Public set', visibility: 'public' }, user = OWNER) => {
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

/** Rows fire-and-forget writes put in `resource_events`, once they land. */
const events = async (count: number) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const rows = await mongoose.connection.collection('resource_events').find({}).sort({ at: 1 }).toArray();
    if (rows.length >= count) return rows;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`expected ${count} resource events`);
};

const groupDataset = (name = 'Team set', user = MEMBER) => createDataset({ name, owner: { kind: 'group', id: GROUP } }, user);

describe('who can see a dataset', () => {
  it('shows a public one to everyone, a private one to its owner, and a group one to its members only', async () => {
    await createDataset();
    await createDataset({ name: 'Mine only' });
    const teamId = await groupDataset();

    const names = async (user?: string, query = '') =>
      ((await call(`/api/datasets${query}`, { user })).body.data.datasets as { name: string }[]).map((row) => row.name).sort();
    expect(await names()).toEqual(['Public set']);
    expect(await names(STRANGER)).toEqual(['Public set']);
    expect(await names(OWNER)).toEqual(['Mine only', 'Public set']);
    expect(await names(MEMBER)).toEqual(['Public set', 'Team set']);
    expect(await names(OWNER, '?owner=me')).toEqual(['Mine only', 'Public set']);
    // An anonymous visitor owns nothing, even among public datasets.
    expect(await names(undefined, '?owner=me')).toEqual([]);
    expect(await names(MEMBER, `?owner=${GROUP}`)).toEqual(['Team set']);
    expect((await call('/api/datasets?search=team', { user: MEMBER })).body.data.pagination.total).toBe(1);

    expect((await call(`/api/datasets/${teamId}`)).status).toBe(401);
    expect((await call(`/api/datasets/${teamId}`, { user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${teamId}`, { user: ADMIN })).body.data).toMatchObject({
      owner: { kind: 'group', id: GROUP, name: 'Team' },
      createdBy: MEMBER,
      visibility: 'private',
      permissions: { read: true, contribute: true, manage: true, own: false }
    });
    expect((await call('/api/datasets/not-an-id')).status).toBe(404);

    // One the old service made after the owner migration ran: out of sight until it has an owner.
    const unowned = (await Dataset.collection.insertOne({ name: 'Unowned', ownerId: OWNER, visibility: 'public', storagePrefix: 'x/', groups: [], holds: [], imageCount: 0 })).insertedId;
    expect(await names()).toEqual(['Public set']);
    expect((await call(`/api/datasets/${unowned}`, { user: OWNER })).status).toBe(404);
  });

  it('gives each group role its permissions, and a removed uploader none', async () => {
    const id = await groupDataset();
    const permissions = async (user: string) => (await call(`/api/datasets/${id}`, { user })).body.data.permissions;
    expect(await permissions(MEMBER)).toEqual({ read: true, contribute: true, manage: false, own: false });
    expect(await permissions(GROUP_OWNER)).toEqual({ read: true, contribute: true, manage: true, own: true });

    delete roles[MEMBER];
    expect((await call(`/api/datasets/${id}`, { user: MEMBER })).status).toBe(403);
    expect((await call('/api/datasets', { user: MEMBER })).body.data.datasets).toEqual([]);
    expect((await call(`/api/datasets/${id}/download`, { user: MEMBER })).status).toBe(403);
    expect((await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: MEMBER, body: { filename: 'x.zip' } })).status).toBe(403);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: MEMBER })).status).toBe(403);
    // The group keeps it.
    expect((await call(`/api/datasets/${id}`, { user: ADMIN })).status).toBe(200);
  });

  it('lists the groups a dataset can belong to', async () => {
    expect((await call('/api/datasets/groups')).status).toBe(401);
    expect((await call('/api/datasets/groups', { user: MEMBER })).body.data).toEqual([{ id: GROUP, name: 'Team', role: 'member' }]);
  });
});

describe('a pipeline key limited to one project', () => {
  const pipelineKey = async (scopes: ('vision:read' | 'vision:write' | 'dataset:read')[]) =>
    (await createApiKey({
      userId: OWNER, userEmail: `${OWNER}@example.test`, userName: 'Owner', name: 'pipeline', scopes,
      project: { id: '0000000000000000000000cc', name: 'road-seg' }
    })).token;
  const withKey = (path: string, token: string, method = 'GET') =>
    fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}` } }).then(async (response) => ({ status: response.status, body: (await response.json()) as Body }));

  it('reads public datasets and its project owner’s private datasets', async () => {
    const publicId = await createDataset({ name: 'Public set', visibility: 'public' });
    const privateId = await createDataset({ name: 'Private set' });
    const token = await pipelineKey(['vision:read', 'vision:write']);

    expect((await withKey(`/api/datasets/${publicId}`, token)).status).toBe(200);
    const listed = await withKey('/api/datasets', token);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain('Public set');
    expect(JSON.stringify(listed.body)).toContain('Private set');
    expect((await withKey(`/api/datasets/${privateId}`, token)).status).toBe(200);
    const otherId = await createDataset({ name: 'Other private' }, STRANGER);
    expect((await withKey(`/api/datasets/${otherId}`, token)).status).toBe(403);
  });

  it('downloads its group owner’s archive but cannot discover unrelated groups or trash', async () => {
    const id = await groupDataset();
    await Dataset.updateOne({ _id: id }, { $set: { archive: { fileId: 'archive', filename: 'set.zip', size: 42, uploadedAt: new Date() } } });
    jest.mocked(projectDatasetOwner).mockResolvedValue({ kind: 'group', id: GROUP });
    const token = await pipelineKey(['vision:write']);
    expect((await withKey(`/api/datasets/${id}/download`, token)).body.data).toMatchObject({ downloadUrl: 'signed:archive' });
    expect((await withKey('/api/datasets/groups', token)).status).toBe(403);
    expect((await withKey('/api/datasets/trash', token)).status).toBe(403);
    const ownId = await createDataset({ name: 'Personal private' });
    expect((await withKey(`/api/datasets/${ownId}`, token)).status).toBe(403);
    jest.mocked(projectDatasetOwner).mockRejectedValueOnce(new (jest.requireActual('@visin/backend-core').ForbiddenError)('No live contribution'));
    expect((await withKey(`/api/datasets/${id}/download`, token)).status).toBe(403);
  });

  it('cannot change a dataset, even its owner’s' , async () => {
    const id = await createDataset({ name: 'Public set', visibility: 'public' });

    expect((await withKey(`/api/datasets/${id}`, await pipelineKey(['vision:write']), 'DELETE')).status).toBe(403);
  });
});

describe('creating a dataset', () => {
  it('makes it private and the creator’s unless told otherwise', async () => {
    const created = (await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'x' } })).body.data;
    expect(created).toMatchObject({ owner: { kind: 'user', id: OWNER }, createdBy: OWNER, visibility: 'private', permissions: { own: true } });
  });

  it('puts it in a group only for the group’s members, and public there only for its owner', async () => {
    const create = (user: string, body: Record<string, unknown>) => call('/api/datasets', { method: 'POST', user, body: { name: 'x', ...body } });
    const inGroup = { owner: { kind: 'group', id: GROUP } };
    expect((await create(STRANGER, inGroup)).status).toBe(403);
    expect((await create(MEMBER, inGroup)).status).toBe(201);
    expect((await create(ADMIN, { ...inGroup, visibility: 'public' })).status).toBe(403);
    expect((await create(GROUP_OWNER, { ...inGroup, visibility: 'public' })).body.data.visibility).toBe('public');
    expect((await create(MEMBER, { owner: { kind: 'user', id: OWNER } })).status).toBe(403);
  });

  it('validates what it is given', async () => {
    expect((await call('/api/datasets', { method: 'POST', body: { name: 'x' } })).status).toBe(401);
    expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: '' } })).status).toBe(400);
    expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'x', owner: { kind: 'team', id: GROUP } } })).status).toBe(400);
    expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'x', visibility: 'group' } })).status).toBe(400);
  });
});

describe('changing a dataset', () => {
  it('lets a manager rename it, and only its owner change who sees it', async () => {
    const id = await groupDataset();
    const patch = (user: string, body: Record<string, unknown>) => call(`/api/datasets/${id}`, { method: 'PATCH', user, body });
    expect((await patch(MEMBER, { name: 'y' })).status).toBe(403);
    expect((await patch(ADMIN, { name: 'Renamed', description: 'by admin' })).body.data).toMatchObject({ name: 'Renamed', description: 'by admin' });
    expect((await patch(ADMIN, { description: '' })).body.data.description).toBeUndefined();
    // The edit form sends the visibility it opened with; unchanged, it needs no more than managing.
    expect((await patch(ADMIN, { name: 'Again', visibility: 'private' })).status).toBe(200);
    expect((await patch(ADMIN, { visibility: 'public' })).status).toBe(403);
    expect((await patch(GROUP_OWNER, { visibility: 'public' })).body.data.visibility).toBe('public');
    expect((await events(1))[0]).toMatchObject({ action: 'visibility', visibility: 'public', actorId: GROUP_OWNER, groupIds: [GROUP] });
  });
});

describe('transferring a dataset', () => {
  it('lets its owner hand it to a group they are in, one way', async () => {
    const id = await createDataset({ name: 'Mine' });
    const transfer = (user: string, owner: Record<string, unknown>) => call(`/api/datasets/${id}/owner`, { method: 'PUT', user, body: { owner } });

    expect((await transfer(OWNER, { kind: 'group', id: GROUP })).status).toBe(403);
    expect((await transfer(STRANGER, { kind: 'group', id: OTHER_GROUP })).status).toBe(403);
    const moved = await transfer(OWNER, { kind: 'group', id: OTHER_GROUP });
    expect(moved.body.data).toMatchObject({ owner: { kind: 'group', id: OTHER_GROUP, name: 'Other team' }, permissions: { own: false } });
    expect((await events(1))[0]).toMatchObject({
      action: 'transfer',
      from: { kind: 'user', id: OWNER },
      to: { kind: 'group', id: OTHER_GROUP },
      groupIds: [OTHER_GROUP],
      resourceName: 'Mine'
    });
    // A member of the group now; taking it back is for the group's owner.
    expect((await transfer(OWNER, { kind: 'user', id: OWNER })).status).toBe(403);
    expect((await transfer(OWNER, { kind: 'group', id: 'not-an-id' })).status).toBe(400);
  });

  it("lets the owning group's owner hand it to a member, or to another group they are in", async () => {
    const id = await groupDataset();
    const transfer = (user: string, owner: Record<string, unknown>) => call(`/api/datasets/${id}/owner`, { method: 'PUT', user, body: { owner } });
    expect((await transfer(ADMIN, { kind: 'user', id: ADMIN })).status).toBe(403);
    expect((await transfer(GROUP_OWNER, { kind: 'user', id: STRANGER })).status).toBe(403);
    expect((await transfer(GROUP_OWNER, { kind: 'group', id: OTHER_GROUP })).body.data.owner).toMatchObject({ kind: 'group', id: OTHER_GROUP });
  });
});

describe('the trash', () => {
  it('hides a trashed dataset at once, and lets its owner restore it or delete it for good', async () => {
    const id = await groupDataset();
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: MEMBER })).status).toBe(403);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: ADMIN })).status).toBe(200);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: ADMIN })).status).toBe(404);
    expect((await call(`/api/datasets/${id}`, { user: ADMIN })).status).toBe(404);
    expect((await call('/api/datasets', { user: ADMIN })).body.data.datasets).toEqual([]);
    expect((await call(`/internal/datasets/${id}`, { internal: true })).status).toBe(404);

    expect((await call('/api/datasets/trash')).status).toBe(401);
    expect((await call('/api/datasets/trash', { user: MEMBER })).body.data).toEqual([]);
    expect((await call('/api/datasets/trash', { user: ADMIN })).body.data.map((row: { _id: string }) => row._id)).toEqual([id]);
    expect((await call(`/api/datasets/${id}/restore`, { method: 'POST', user: ADMIN })).status).toBe(403);
    expect((await call(`/api/datasets/not-an-id/restore`, { method: 'POST', user: ADMIN })).status).toBe(404);
    const restored = await call(`/api/datasets/${id}/restore`, { method: 'POST', user: GROUP_OWNER });
    expect(restored.body.data.trashedAt).toBeUndefined();
    expect((await call(`/api/datasets/${id}`, { user: MEMBER })).status).toBe(200);

    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: GROUP_OWNER })).status).toBe(404);
    await call(`/api/datasets/${id}`, { method: 'DELETE', user: GROUP_OWNER });
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: ADMIN })).status).toBe(403);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: GROUP_OWNER })).status).toBe(202);
    expect(enqueueDelete).toHaveBeenCalledWith({ datasetId: id });
    expect((await events(4)).map((row) => row.action)).toEqual(['trash', 'restore', 'trash', 'purge']);
  });

  it('deletes what has been in the trash for 30 days, except what labeling still uses', async () => {
    const old = await createDataset({ name: 'old' });
    const held = await createDataset({ name: 'held' });
    const recent = await createDataset({ name: 'recent' });
    const monthAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await Dataset.updateMany({ _id: { $in: [old, held] } }, { $set: { trashedAt: monthAgo } });
    await Dataset.updateOne({ _id: recent }, { $set: { trashedAt: new Date() } });
    await Dataset.updateOne({ _id: held }, { $push: { holds: { service: 'label-service', ref: 'j1', createdAt: new Date() } } });

    expect(await purgeExpiredTrash()).toBe(1);
    expect(enqueueDelete).toHaveBeenCalledWith({ datasetId: old });
    expect((await Dataset.findById(old).lean())?.deletingAt).toBeInstanceOf(Date);
    expect((await Dataset.findById(held).lean())?.deletingAt).toBeUndefined();
    expect(await purgeExpiredTrash()).toBe(0);
  });
});

describe('what label-service asks', () => {
  it('tells group-service what a group still owns, trashed datasets included', async () => {
    const team = await groupDataset();
    await call(`/api/datasets/${team}`, { method: 'DELETE', user: ADMIN });
    await createDataset({ name: 'Mine' });
    expect((await call(`/internal/groups/${GROUP}/owned`, { internal: true })).body.data).toEqual({ count: 1, names: ['Team set'] });
    expect((await call(`/internal/groups/${GROUP}/owned`)).status).toBe(401);
  });

  it('answers what one account may do with a dataset, and which datasets it may do something with', async () => {
    const team = await groupDataset();
    const open = await createDataset();
    const permission = async (id: string, userId?: string) =>
      (await call(`/internal/datasets/${id}/permission${userId ? `?userId=${userId}` : ''}`, { internal: true })).body.data.permission;
    expect(await permission(team, ADMIN)).toBe('manage');
    expect(await permission(team, STRANGER)).toBe('none');
    expect(await permission(open)).toBe('read');

    const ids = async (query: string) => (await call(`/internal/datasets/ids?${query}`, { internal: true })).body.data.sort();
    expect(await ids(`userId=${ADMIN}&min=manage`)).toEqual([team]);
    expect(await ids(`userId=${MEMBER}&min=contribute`)).toEqual([team]);
    expect(await ids(`userId=${MEMBER}`)).toEqual([open, team].sort());
    expect((await call(`/internal/datasets?userId=${ADMIN}&min=manage`, { internal: true })).body.data.map((row: { _id: string; owner: unknown }) => [row._id, row.owner]))
      .toEqual([[team, { kind: 'group', id: GROUP }]]);
    expect((await call(`/internal/datasets/ids?min=owner`, { internal: true })).status).toBe(400);
  });
});

describe('archive upload, download and import', () => {
  it('adopts the zip at once, reads its index in the background, and replaces a previous archive', async () => {
    const id = await createDataset();
    expect((await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.tar' } })).status).toBe(400);
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(400);
    expect((await call(`/api/datasets/${id}/download`)).status).toBe(400);

    const first = await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }, { path: 'lidar/1.bin', data: Buffer.alloc(10) }]);
    expect(first.completed.status).toBe(200);
    // The request returns before the zip is read: the browser can leave now.
    expect(first.completed.body.data).toMatchObject({ archive: { filename: 'set.zip' }, scan: { status: 'queued' } });
    expect(first.completed.body.data).not.toHaveProperty('contents');
    expect(enqueueScan).toHaveBeenCalledWith({ datasetId: id, fileId: first.fileId });

    // What the worker does with that job.
    await runScan(id, first.fileId);
    const scanned = (await call(`/api/datasets/${id}`)).body.data;
    expect(scanned.contents).toMatchObject({ entries: 2, totalBytes: 11 });
    expect(scanned.scan.status).toBe('done');

    const second = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('y') }]);
    expect(second.completed.status).toBe(200);
    expect(fileStore.stored.has(first.fileId)).toBe(false);
    expect((await call(`/api/datasets/${id}/download`)).body.data).toMatchObject({
      downloadUrl: `signed:${second.fileId}`, size: second.completed.body.data.archive.size,
      revision: second.completed.body.data.archive.uploadedAt
    });
  });

  it('scans a zip that is already stored — what a migrated dataset starts with', async () => {
    const id = await createDataset();
    expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER })).status).toBe(400);

    const fileId = `label-bundles/${id}/upload.zip`;
    fileStore.stored.set(fileId, zip([{ path: 'frames/1.png', data: Buffer.from('xy') }]));
    await Dataset.updateOne({ _id: id }, { $set: { archive: { fileId, filename: 'upload.zip', uploadedAt: new Date() } } });
    expect((await call(`/api/datasets/${id}`)).body.data.archive).not.toHaveProperty('size');

    expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: STRANGER })).status).toBe(403);
    const queued = await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER });
    expect(queued.status).toBe(200);
    expect(queued.body.data.scan).toEqual({ status: 'queued' });
    expect(enqueueScan).toHaveBeenCalledWith({ datasetId: id, fileId });

    await runScan(id, fileId);
    const scanned = (await call(`/api/datasets/${id}`)).body.data;
    expect(scanned.archive.size).toBeGreaterThan(0);
    expect(scanned.contents).toMatchObject({ entries: 1, totalBytes: 2 });
  });

  it('resumes an interrupted upload of the same file, and drops an abandoned one for another', async () => {
    const id = await createDataset();
    const file = { filename: 'set.zip', size: 4000, lastModified: 17 };
    const upload = (body: object) => call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body });

    const first = (await upload(file)).body.data;
    expect(first).toMatchObject({ uploaded: false, resumed: false });
    expect((await call(`/api/datasets/${id}`)).body.data.uploading).toEqual({ filename: 'set.zip', size: 4000 });

    // The same file again continues the same reservation.
    const again = (await upload(file)).body.data;
    expect(again).toMatchObject({ uploadUrl: first.uploadUrl, resumed: true, uploaded: false });

    // Every byte had arrived: only finishing is left.
    const fileId = first.uploadUrl.replace('upload:', '');
    fileStore.stored.set(fileId, Buffer.from('bytes'));
    expect((await upload(file)).body.data).toEqual({ uploaded: true, resumed: true });

    // A different file (same name, other size) starts over and deletes the abandoned bytes.
    const other = (await upload({ ...file, size: 5000 })).body.data;
    expect(other).toMatchObject({ resumed: false });
    expect(other.uploadUrl).not.toBe(first.uploadUrl);
    expect(fileStore.stored.has(fileId)).toBe(false);
  });

  it('discards an interrupted upload and its partial bytes', async () => {
    const id = await createDataset();
    const reserved = (await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.zip' } })).body.data;
    const fileId = reserved.uploadUrl.replace('upload:', '');
    fileStore.stored.set(fileId, Buffer.from('partial'));
    expect((await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: STRANGER })).status).toBe(403);
    const discarded = await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: OWNER });
    expect(discarded.status).toBe(200);
    expect(discarded.body.data.uploading).toBeUndefined();
    expect(fileStore.stored.has(fileId)).toBe(false);
    expect((await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: OWNER })).status).toBe(200);
  });

  it('starts over when an interrupted reservation can no longer be resumed', async () => {
    const id = await createDataset();
    const file = { filename: 'set.zip', size: 4000, lastModified: 17 };
    const first = (await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: file })).body.data;
    jest.mocked(fileStore.client.getUploadUrl).mockRejectedValueOnce(new Error('Upload path is already reserved'));
    jest.mocked(fileStore.client.deleteFile).mockRejectedValueOnce(new Error('file-service down'));
    const next = (await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: file })).body.data;
    expect(next).toMatchObject({ resumed: false });
    expect(next.uploadUrl).not.toBe(first.uploadUrl);
  });

  it('refuses to finish an upload that never arrived, and reports a file that is not a zip', async () => {
    const id = await createDataset();
    const reserved = await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.zip' } });
    // The upload is still pending, so the page can offer to finish it later.
    expect((await call(`/api/datasets/${id}`)).body.data.uploading).toEqual({ filename: 'set.zip' });
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).body.message).toContain('upload the zip again');

    const fileId = reserved.body.data.uploadUrl.replace('upload:', '');
    fileStore.stored.set(fileId, Buffer.from('definitely not a zip file'));
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(200);

    await expect(runScan(id, fileId)).rejects.toThrow(/not a readable zip archive \(.+\)/);
    await markScanFailed(id, fileId, 'The uploaded file is not a readable zip archive');
    expect((await call(`/api/datasets/${id}`)).body.data.scan).toMatchObject({ status: 'failed', error: 'The uploaded file is not a readable zip archive' });
  });

  it('retries a scan file-service could not serve, instead of calling the zip unreadable', async () => {
    const id = await createDataset();
    const { fileId } = await uploadZip(id, [{ path: 'a.txt', data: Buffer.from('hi') }]);
    jest.mocked(fileStore.client.getFileRange).mockRejectedValueOnce(new BadGatewayError('file-service ignored a Range request'));
    const failure = await runScan(id, fileId).catch((err: Error) => err);
    expect(failure).toBeInstanceOf(BadGatewayError);
    expect(failure).not.toBeInstanceOf(NonRetryableImportError);
    jest.mocked(fileStore.client.getFileRange).mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(runScan(id, fileId)).rejects.toThrow('fetch failed');
    await runScan(id, fileId);
    expect((await call(`/api/datasets/${id}`)).body.data.scan.status).toBe('done');
  });

  it('ignores a scan whose archive has since been replaced, or whose file is gone', async () => {
    const id = await createDataset();
    const { fileId } = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('x') }]);
    await runScan(id, 'some/older/upload.zip');
    expect((await Dataset.findById(id).lean())?.scan?.status).toBe('queued');

    fileStore.stored.delete(fileId);
    await expect(runScan(id, fileId)).rejects.toThrow('no longer stored');
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

describe('resuming an import', () => {
  it('queues a cancelled or failed import again under its own id', async () => {
    const id = await createDataset();
    const resume = () => call(`/api/datasets/${id}/import/resume`, { method: 'POST', user: OWNER });
    expect((await resume()).status).toBe(409);

    const { fileId } = await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    const importState = (status: string, archiveFileId = fileId) => ({
      id: 'imp', status, archiveFileId, mapping: { groups: [{ folder: 'frames', group: 'frames' }] }, processed: 100, skipped: 0,
      errors: [{ path: '(zip)', reason: 'The database ran out of space' }], finishedAt: new Date()
    });
    await Dataset.updateOne({ _id: id }, { $set: { import: importState('running') } });
    expect((await resume()).status).toBe(409);

    await Dataset.updateOne({ _id: id }, { $set: { import: importState('cancelled', 'older.zip') } });
    expect((await resume()).body.message).toContain('zip was replaced');

    await Dataset.updateOne({ _id: id }, { $set: { import: importState('failed') } });
    expect((await call(`/api/datasets/${id}/import/resume`, { method: 'POST', user: STRANGER })).status).toBe(403);
    const resumed = await resume();
    expect(resumed.status).toBe(202);
    expect(resumed.body.data.import).toMatchObject({ id: 'imp', status: 'queued', processed: 100, errors: [] });
    expect(removeQueuedImport).toHaveBeenCalledWith('imp');
    expect(enqueueImport).toHaveBeenCalledWith({ datasetId: id, importId: 'imp' });
    expect((await resume()).status).toBe(409);
  });
});

describe('holds', () => {
  it('keeps a dataset labeling uses from being deleted for good, though it can go in the trash', async () => {
    const id = await createDataset();
    const { fileId } = await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT' })).status).toBe(401);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT', internal: true })).status).toBe(204);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT', internal: true })).status).toBe(204);
    expect((await call(`/api/datasets/${id}`)).body.data.usedBy).toBe(1);

    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: { groups: [{ folder: '', group: 'all' }] } })).status).toBe(409);
    expect((await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'b.zip' } })).status).toBe(409);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER })).status).toBe(200);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER })).status).toBe(409);

    // A job deleted while its dataset is in the trash still lets go of it.
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'DELETE', internal: true })).status).toBe(204);
    expect((await call(`/internal/datasets/not-an-id/holds/label-service/job1`, { method: 'DELETE', internal: true })).status).toBe(404);
    await DatasetItem.create({ datasetId: id, group: 'g', path: 'p.png', stem: 'p', kind: 'image', size: 1 });
    await Dataset.updateOne({ _id: id }, { $set: { 'import.id': 'i', 'import.status': 'queued' } });
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER })).status).toBe(202);
    expect(removeQueuedImport).toHaveBeenCalledWith('i');
    expect(enqueueDelete).toHaveBeenCalledWith({ datasetId: id });

    // Gone for every reader, and no longer claimable; the files wait for the worker.
    expect((await call(`/api/datasets/${id}`)).status).toBe(404);
    expect((await call('/api/datasets/trash', { user: OWNER })).body.data).toEqual([]);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job2`, { method: 'PUT', internal: true })).status).toBe(404);
    expect((await Dataset.findById(id).lean())?.import?.status).toBe('cancelled');
    expect(fileStore.stored.has(fileId)).toBe(true);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER })).status).toBe(404);
    expect(await resumeDeletions()).toBe(1);
    await runDelete(id);
    expect(fileStore.stored.has(fileId)).toBe(false);
    expect(await DatasetItem.countDocuments({ datasetId: id })).toBe(0);
    expect(await Dataset.countDocuments({ _id: id })).toBe(0);
    await runDelete(id);
  });

  it('refuses a permanent delete that loses the race to a new hold', async () => {
    const id = await createDataset();
    await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER });
    const findOne = Dataset.findOne.bind(Dataset);
    // The hold lands between reading the dataset and marking it.
    const spy = jest.spyOn(Dataset, 'findOne').mockImplementationOnce(((...args: Parameters<typeof Dataset.findOne>) => {
      const read = findOne(...args).exec();
      return read.then(async (dataset) => {
        await Dataset.updateOne({ _id: id }, { $push: { holds: { service: 'label-service', ref: 'late', createdAt: new Date() } } });
        return dataset;
      });
    }) as unknown as typeof Dataset.findOne);
    const response = await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER });
    spy.mockRestore();
    expect(response.status).toBe(409);
    expect((await Dataset.findById(id).lean())?.deletingAt).toBeUndefined();
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

  it('removes one image group in the background, hiding it at once', async () => {
    const datasetId = new mongoose.Types.ObjectId(id);
    for (const item of await DatasetItem.find({ datasetId })) {
      fileStore.stored.set(item.fileId!, Buffer.from('x'));
      if (item.thumbnailFileId) fileStore.stored.set(item.thumbnailFileId, Buffer.from('t'));
    }
    await Dataset.updateOne({ _id: id }, {
      $set: {
        groups: [{ name: 'frames', images: 2, jsons: 0 }, { name: 'verify', images: 1, jsons: 2 }],
        imageCount: 3,
        coverPath: 'frames/0002.jpg',
        import: { id: 'i', status: 'done', mapping: { groups: [{ folder: 'frames', group: 'frames' }, { folder: 'verify', group: 'verify' }] }, processed: 5, skipped: 0, errors: [] }
      }
    });
    const remove = (group: string, user = OWNER) => call(`/api/datasets/${id}/groups/${group}`, { method: 'DELETE', user });

    expect((await remove('frames', STRANGER)).status).toBe(403);
    expect((await remove('lidar')).status).toBe(404);
    const removed = await remove('frames');
    expect(removed.status).toBe(202);
    expect(enqueueRemoveGroup).toHaveBeenCalledWith({ datasetId: id, group: 'frames' });
    expect(removed.body.data).toMatchObject({ groups: [{ name: 'verify' }], imageCount: 1, removingGroups: ['frames'] });
    expect((await remove('frames')).status).toBe(409);

    // Gone for readers and for labeling straight away; the files wait for the worker.
    expect((await call(`/api/datasets/${id}/items?kind=image`)).body.data.items.map((item: { path: string }) => item.path)).toEqual(['verify/0001.ids.png']);
    expect((await call(`/api/datasets/${id}/items?group=frames`)).body.data.items).toEqual([]);
    expect((await call(`/internal/datasets/${id}/items?group=frames`, { internal: true })).body.data.items).toEqual([]);
    expect((await call(`/internal/datasets/${id}/items`, { internal: true })).body.data.items).toHaveLength(3);
    expect((await call(`/internal/datasets/${id}`, { internal: true })).body.data.groups).toEqual([{ name: 'verify', images: 1, jsons: 2 }]);
    expect(fileStore.stored.has('f1')).toBe(true);
    await Dataset.updateOne({ _id: id }, { $set: { archive: { fileId: 'z.zip', filename: 'z.zip', uploadedAt: new Date() } } });
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: { groups: [{ folder: 'frames', group: 'frames' }] } })).status).toBe(409);

    expect(await resumeDeletions()).toBe(1);
    await runRemoveGroup(id, 'frames');
    for (const fileId of ['f1', 't1', 'f2', 't2']) expect(fileStore.stored.has(fileId)).toBe(false);
    expect(fileStore.stored.has('i1')).toBe(true);
    const after = await Dataset.findById(id).lean();
    expect(after).toMatchObject({ imageCount: 1, removingGroups: [] });
    // The pick went with its group, and an id map is never an automatic cover.
    expect(after?.coverPath).toBeUndefined();
    expect(after?.coverFileId).toBeUndefined();
    expect(after?.import?.mapping.groups).toEqual([{ folder: 'verify', group: 'verify' }]);
    expect(await DatasetItem.countDocuments({ datasetId, group: 'frames' })).toBe(0);
    await runRemoveGroup(id, 'frames');
  });

  it('refuses to remove a group while labeling holds the dataset or an import runs', async () => {
    await Dataset.updateOne({ _id: id }, { $set: { groups: [{ name: 'frames', images: 2, jsons: 0 }] } });
    await Dataset.updateOne({ _id: id }, { $set: { 'import.id': 'i', 'import.status': 'queued' } });
    expect((await call(`/api/datasets/${id}/groups/frames`, { method: 'DELETE', user: OWNER })).status).toBe(409);
    await Dataset.updateOne({ _id: id }, { $unset: { import: '' }, $push: { holds: { service: 'label-service', ref: 'job', createdAt: new Date() } } });
    expect((await call(`/api/datasets/${id}/groups/frames`, { method: 'DELETE', user: OWNER })).status).toBe(409);
  });

  it('lets a writer pick the cover image, and go back to the automatic one', async () => {
    const [frame] = (await call(`/api/datasets/${id}/items?group=frames&limit=1`)).body.data.items;
    const cover = (itemId: string | null, user = OWNER) => call(`/api/datasets/${id}/cover`, { method: 'PUT', user, body: { itemId } });

    expect((await cover(frame._id, STRANGER)).status).toBe(403);
    expect((await cover('0123456789abcdef01234567')).status).toBe(404);
    expect((await cover('not-an-id')).status).toBe(400);
    const json = await DatasetItem.findOne({ datasetId: id, kind: 'json' });
    expect((await cover(json!._id.toString())).status).toBe(404);

    const second = await DatasetItem.findOne({ datasetId: id, path: 'frames/0002.jpg' });
    const picked = await cover(second!._id.toString());
    expect(picked.body.data).toMatchObject({ coverPath: 'frames/0002.jpg', coverUrl: 'signed:t2' });
    expect((await call('/api/datasets')).body.data.datasets[0].coverUrl).toBe('signed:t2');

    const automatic = await cover(null);
    expect(automatic.body.data.coverPath).toBeUndefined();
    expect(automatic.body.data.coverUrl).toBe('signed:t1');
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


describe('resolving the dataset actually used by a training', () => {
  const resolve = (reference: string, userId = OWNER, projectOwner?: { kind: 'user' | 'group'; id: string }) =>
    call('/internal/datasets/resolve', { internal: true, method: 'POST', body: { reference, userId, projectOwner } });

  it('pins the id and archive version, and treats name characters literally', async () => {
    const id = await createDataset({ name: 'ZOD.v1' });
    const version = new Date('2026-10-01T12:00:00.000Z');
    await Dataset.updateOne({ _id: id }, { $set: { archive: { fileId: 'archive', filename: 'set.zip', size: 42, uploadedAt: version } } });
    expect((await resolve('zod.v1')).body.data).toEqual({ source: 'visin', id, name: 'ZOD.v1', revision: version.toISOString() });
    expect((await resolve(id)).status).toBe(200);
    expect((await resolve('ZOD.*')).status).toBe(404);
    expect((await resolve(id, STRANGER)).status).toBe(404);
    const bare = await createDataset({ name: 'No archive' });
    expect((await resolve(bare)).body.data).toEqual({ source: 'visin', id: bare, name: 'No archive' });
  });

  it('requires an id for ambiguous names and rejects trash and unrelated ownership', async () => {
    await createDataset({ name: 'ZOD', visibility: 'public' });
    const id = await createDataset({ name: 'zod' });
    expect((await resolve('ZOD')).status).toBe(400);
    expect((await resolve(id, OWNER, { kind: 'group', id: GROUP })).status).toBe(404);
    expect((await resolve(id, STRANGER, { kind: 'user', id: OWNER })).status).toBe(200);
    await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER });
    expect((await resolve(id)).status).toBe(404);
    expect((await call('/internal/datasets/resolve', { method: 'POST', body: { reference: id, userId: OWNER } })).status).toBe(401);
    expect((await call('/internal/datasets/resolve', { method: 'POST', internal: true, body: {} })).status).toBe(400);
  });
});

describe('datasets kept on the Hugging Face Hub', () => {
  const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
  const source = { provider: 'hf', repo: 'acme/zod-png', revision: COMMIT };
  const resolve = (reference: string) => call('/internal/datasets/resolve', { internal: true, method: 'POST', body: { reference, userId: OWNER } });

  it('is created on the Hub alone and downloads by pointer, with no zip', async () => {
    const id = await createDataset({ name: 'Hub set', visibility: 'public', source: { repo: 'acme/zod-png', revision: COMMIT.toUpperCase() } });
    expect((await call(`/api/datasets/${id}`)).body.data.source).toEqual(source);
    const download = (await call(`/api/datasets/${id}/download`)).body.data;
    expect(download).toEqual({ source, revision: COMMIT });
    expect(download).not.toHaveProperty('downloadUrl');
    const resolved = (await resolve(id)).body.data;
    expect(resolved).toMatchObject({ id, revision: COMMIT });
    expect(resolved).not.toHaveProperty('archiveRevision');
  });

  it('keeps the zip as the local fallback and reports both revisions', async () => {
    const id = await createDataset();
    const { completed } = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('y') }]);
    expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source } })).body.data.source).toEqual(source);
    const download = (await call(`/api/datasets/${id}/download`)).body.data;
    expect(download).toMatchObject({ source, revision: COMMIT, archiveRevision: completed.body.data.archive.uploadedAt });
    expect(download.downloadUrl).toMatch(/^signed:/);
    // A run that resolves it records both, so a zip replaced under an unchanged commit still shows.
    expect((await resolve(id)).body.data).toMatchObject({ id, revision: COMMIT, archiveRevision: completed.body.data.archive.uploadedAt });
  });

  it('goes back to the local zip when the source is cleared, and needs manage to change', async () => {
    const id = await createDataset();
    await uploadZip(id, [{ path: 'a.png', data: Buffer.from('y') }]);
    await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source } });
    expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: STRANGER, body: { source: null } })).status).toBe(403);
    const cleared = await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source: null } });
    expect(cleared.body.data).not.toHaveProperty('source');
    const download = (await call(`/api/datasets/${id}/download`)).body.data;
    expect(download).not.toHaveProperty('source');
    expect(download.revision).toBe(download.archiveRevision);
  });

  it('refuses anything but a repo id pinned to a commit', async () => {
    const id = await createDataset();
    for (const bad of [
      { repo: 'acme/zod-png', revision: 'main' },
      { repo: 'acme/zod-png', revision: COMMIT.slice(0, 7) },
      { repo: 'zod-png', revision: COMMIT },
      { repo: 'acme/zod-png', revision: COMMIT, provider: 's3' }
    ]) expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source: bad } })).status).toBe(400);
    expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'Bad', source: { repo: 'x', revision: 'main' } } })).status).toBe(400);
  });

  it('shows what the Hub says about the repo to anyone who may read the dataset, and nothing for a private one', async () => {
    clearHubCache();
    jest.mocked(fetchDatasetInfo).mockResolvedValue({ cardData: { license: 'mit' }, siblings: [{ rfilename: 'train/a.png', size: 7 }] });
    const id = await createDataset({ name: 'Hub set', visibility: 'public', source });
    const info = (await call(`/api/datasets/${id}/hub`)).body.data;
    expect(info).toMatchObject({ repo: 'acme/zod-png', revision: COMMIT, license: 'mit', fileCount: 1, totalBytes: 7, folders: [{ path: 'train', files: 1, bytes: 7 }] });
    expect(fetchDatasetInfo).toHaveBeenCalledWith('acme/zod-png', COMMIT);
    const privateId = await createDataset({ name: 'Mine', source }, OWNER);
    expect((await call(`/api/datasets/${privateId}/hub`, { user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${privateId}/hub`, { user: OWNER })).status).toBe(200);
  });

  it('has nothing to show for a dataset that is only a zip', async () => {
    const id = await createDataset();
    expect((await call(`/api/datasets/${id}/hub`)).status).toBe(400);
    expect(fetchDatasetInfo).not.toHaveBeenCalled();
  });
});
