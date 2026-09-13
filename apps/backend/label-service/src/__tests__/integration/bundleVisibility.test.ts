import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, optionalAuth } from '@visin/backend-core';
import { LabelJob, JobStatus } from '../../models/LabelJob';
import { LabelBundle } from '../../models/LabelBundle';
import bundleRoutes from '../../routes/bundleRoutes';
import { checkMembership, getMyGroups } from '../../clients/groupServiceClient';

jest.mock('../../clients/groupServiceClient', () => ({ checkMembership: jest.fn(), getMyGroups: jest.fn() }));
jest.mock('../../clients/fileServiceClient', () => ({
  getUploadUrl: jest.fn(),
  listFiles: jest.fn(),
  fileExists: jest.fn(),
  deleteFolder: jest.fn(),
}));
jest.mock('../../queue/importQueue', () => ({ enqueueImport: jest.fn(), removeQueuedImport: jest.fn() }));

const membership = checkMembership as jest.Mock;
const myGroups = getMyGroups as jest.Mock;
const actors: Record<string, string> = {
  owner: '000000000000000000000001',
  member: '000000000000000000000002',
  stranger: '000000000000000000000003',
};
const creator = { userId: 'owner', email: 'PRIVATE_UPLOADER@example.test' };

describe('bundle visibility with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const oldSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'label-bundle-visibility-test-secret';
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), optionalAuth);
    app.use('/bundles', bundleRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 120_000);

  beforeEach(async () => {
    await mongoose.connection
      .collection('users')
      .insertMany(
        Object.entries(actors).map(([name, id]) => ({
          _id: new mongoose.Types.ObjectId(id),
          email: `${name}@example.test`,
          tokenVersion: 1,
        }))
      );
    jest.clearAllMocks();
    membership.mockImplementation(async (groupId: string, userId: string) => ({
      member: groupId === 'actual-group' && [actors.member, actors.owner].includes(userId),
      role: userId === actors.owner ? 'owner' : 'member',
    }));
    myGroups.mockImplementation(async (userId: string) =>
      [actors.member, actors.owner].includes(userId) ? [{ groupId: 'actual-group', name: 'G', role: 'member' }] : []
    );
  });

  afterEach(async () => {
    await Promise.all([
      mongoose.connection.collection('users').deleteMany({}),
      LabelJob.deleteMany({}),
      LabelBundle.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });

  const request = (path: string, userId?: string, method = 'GET', body?: object) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(userId
          ? {
              authorization: `Bearer ${jwt.sign(
                { id: actors[userId], tokenVersion: 1, email: `${userId}@example.test`, name: userId },
                process.env.JWT_SECRET!
              )}`,
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  /** A bundle with one job on it, shared or not. */
  const bundleWithJob = async (name: string, status: JobStatus, isPublic: boolean) => {
    const bundle = await LabelBundle.create({ name, groupId: 'actual-group', createdBy: creator, status: 'ready' });
    await LabelJob.create({
      name: `${name} job`,
      groupId: 'actual-group',
      createdBy: creator,
      status,
      isPublic,
      bundleId: bundle.id,
      taskType: 'single_choice',
      question: { prompt: 'p', choices: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] },
    });
    return bundle;
  };

  it('lists only bundles behind a publicly shared, active job to an anonymous visitor', async () => {
    await bundleWithJob('Shared', 'active', true);
    await bundleWithJob('Unshared', 'active', false);
    await bundleWithJob('Paused', 'paused', true);

    const response = await request('/bundles');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text).data.map((b: { name: string }) => b.name)).toEqual(['Shared']);
    expect(text).not.toContain('PRIVATE_UPLOADER');
  });

  it('reads a shared bundle anonymously, without its uploader, and refuses an unshared one', async () => {
    const shared = await bundleWithJob('Shared', 'active', true);
    const unshared = await bundleWithJob('Unshared', 'active', false);

    const sharedResponse = await request(`/bundles/${shared.id}`);
    const sharedText = await sharedResponse.text();
    expect(sharedResponse.status).toBe(200);
    expect(sharedText).toContain('Shared');
    expect(sharedText).not.toContain('PRIVATE_UPLOADER');

    expect((await request(`/bundles/${unshared.id}`)).status).toBe(403);
    expect((await request(`/bundles/${unshared.id}`, 'stranger')).status).toBe(403);
    // Membership still reads everything, uploader included.
    const memberText = await (await request(`/bundles/${unshared.id}`, 'member')).text();
    expect(memberText).toContain('private_uploader@example.test');
  });

  it('lets nobody without group admin change a shared bundle', async () => {
    const shared = await bundleWithJob('Shared', 'active', true);
    const writes: [string, string, object?][] = [
      ['PATCH', `/bundles/${shared.id}`, { name: 'Renamed' }],
      ['DELETE', `/bundles/${shared.id}`],
      ['POST', `/bundles/${shared.id}/upload-url`],
      ['GET', `/bundles/${shared.id}/uploads`],
      ['POST', `/bundles/${shared.id}/import`, { zipFileId: 'x' }],
      ['GET', `/bundles/${shared.id}/mask-fields?set=s`],
      ['POST', '/bundles', { name: 'New', groupId: 'actual-group' }],
    ];

    for (const [method, path, body] of writes) {
      expect({ method, path, status: (await request(path, undefined, method, body)).status }).toEqual({
        method,
        path,
        status: 401,
      });
    }
    expect((await request(`/bundles/${shared.id}`, 'stranger', 'PATCH', { name: 'Renamed' })).status).toBe(403);
    expect((await request(`/bundles/${shared.id}`, 'member', 'DELETE')).status).toBe(403);

    const after = await LabelBundle.findById(shared.id);
    expect(after?.name).toBe('Shared');
  });
});
