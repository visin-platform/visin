import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, resetEncryptionKeyCache } from '@visin/backend-core';
import { projectDatasetOwner } from '../../clients/projectServiceClient';
import { datasetApiGuards } from '../../apiGuards';
import { checkMembership, getMyGroups, type GroupRole } from '../../clients/groupServiceClient';
import { runScan } from '../../services/scanService';
import { Dataset } from '../../models/Dataset';
import { DatasetItem } from '../../models/DatasetItem';
import datasetRoutes from '../../routes/datasetRoutes';
import internalRoutes from '../../routes/internalRoutes';
import { fileStore } from '../fixtures/fileStore';
import { zip } from '../fixtures/zip';

export const OWNER = '000000000000000000000001';
export const MEMBER = '000000000000000000000002';
export const ADMIN = '000000000000000000000003';
export const STRANGER = '000000000000000000000004';
export const GROUP_OWNER = '000000000000000000000005';
export const GROUP = '0000000000000000000000aa';
export const OTHER_GROUP = '0000000000000000000000bb';
/** Each user's role in GROUP; a test that removes someone deletes their entry. */
export const roles: Record<string, GroupRole> = {};
/** Each user's role in OTHER_GROUP. */
export const otherRoles: Record<string, GroupRole> = {};
const secret = 'dataset-service-test-secret';
const internalToken = 'internal-test-token';

let mongo: MongoMemoryServer;
let server: Server;
export let baseUrl = '';

const replace = (target: Record<string, GroupRole>, next: Record<string, GroupRole>): void => {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
};
const saved = {
  jwt: process.env.JWT_SECRET,
  internal: process.env.INTERNAL_SERVICE_TOKEN,
  encryption: process.env.API_KEY_ENCRYPTION_SECRET
};

/**
 * Starts the dataset API against an in-memory database for one test file, with the seeded users and group
 * roles. Call it once at the top of the file, below its `jest.mock` lines (those must stay in the test file).
 */
export function useDatasetApi(): void {
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    process.env.INTERNAL_SERVICE_TOKEN = internalToken;
    process.env.API_KEY_ENCRYPTION_SECRET = 'dataset-service-key-test-secret';
    resetEncryptionKeyCache();
    mongo = await MongoMemoryServer.create();
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
    replace(roles, { [MEMBER]: 'member', [ADMIN]: 'admin', [GROUP_OWNER]: 'owner' });
    await mongoose.connection
      .collection('users')
      .insertMany(
        [OWNER, MEMBER, ADMIN, STRANGER, GROUP_OWNER].map((id) => ({
          _id: new mongoose.Types.ObjectId(id),
          email: `${id}@example.test`,
          tokenVersion: 1
        }))
      );
    // Each test token names a session whose id is its user's.
    await mongoose.connection.collection('user_sessions').insertMany(
      (
        await mongoose.connection
          .collection('users')
          .find({}, { projection: { _id: 1 } })
          .toArray()
      ).map(({ _id }) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) }))
    );
    replace(otherRoles, { [GROUP_OWNER]: 'member', [OWNER]: 'member' });
    const roleIn = (groupId: string, userId: string): GroupRole | undefined =>
      groupId === GROUP ? roles[userId] : groupId === OTHER_GROUP ? otherRoles[userId] : undefined;
    jest.mocked(checkMembership).mockImplementation(async (groupId, userId) => {
      const role = roleIn(groupId, userId);
      return role ? { member: true, role } : { member: false, role: null };
    });
    jest
      .mocked(getMyGroups)
      .mockImplementation(async (userId) => [
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
}

export const tokenFor = (userId: string) => {
  const unsigned = [
    { alg: 'HS256', typ: 'JWT' },
    {
      id: userId,
      email: `${userId}@example.test`,
      tokenVersion: 1,
      sid: userId,
      typ: 'session',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60
    }
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response shapes vary per route; each assertion names what it reads
export type Body = { data?: any; message?: string };

export const call = async (
  path: string,
  { method = 'GET', user, body, internal }: { method?: string; user?: string; body?: unknown; internal?: boolean } = {}
) => {
  const headers: Record<string, string> = {};
  if (user) headers.Authorization = `Bearer ${tokenFor(user)}`;
  if (internal) headers['x-internal-token'] = internalToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
};

export const createDataset = async (
  body: Record<string, unknown> = { name: 'Public set', visibility: 'public' },
  user = OWNER
) => {
  const response = await call('/api/datasets', { method: 'POST', user, body });
  expect(response.status).toBe(201);
  return response.body.data._id as string;
};

export const runCurrentScan = async (id: string, fileId: string) => {
  const scanId = (await Dataset.findById(id).lean())?.scan?.id;
  return runScan(id, fileId, scanId);
};

export const uploadZip = async (id: string, entries: { path: string; data: Buffer }[]) => {
  const reserved = await call(`/api/datasets/${id}/archive/upload-url`, {
    method: 'POST',
    user: OWNER,
    body: { filename: 'set.zip' }
  });
  expect(reserved.status).toBe(201);
  const fileId = reserved.body.data.uploadUrl.replace('upload:', '');
  fileStore.stored.set(fileId, zip(entries));
  return { fileId, completed: await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER }) };
};

/** Rows fire-and-forget writes put in `resource_events`, once they land. */
export const events = async (count: number) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const rows = await mongoose.connection.collection('resource_events').find({}).sort({ at: 1 }).toArray();
    if (rows.length >= count) return rows;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`expected ${count} resource events`);
};

export const groupDataset = (name = 'Team set', user = MEMBER) =>
  createDataset({ name, owner: { kind: 'group', id: GROUP } }, user);
