import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApiKey, errorHandler, resetEncryptionKeyCache } from '@visin/backend-core';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import { projectKeyAuth } from '../../middleware/projectKeyAuth';
import projectRoutes from '../../routes/projectRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import Project from '../../models/Project';
import Training from '../../models/Training';
import { getUserGroups } from '../../clients/projectGroupsClient';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
const groupsOf = getUserGroups as jest.Mock;

/**
 * An API key limited to one project, end to end: confined like a legacy project
 * token, but acting with its owner's real permissions, editor groups included.
 */
describe('API keys limited to a project, through HTTP and in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  let own: string;
  let otherOwn: string;
  let shared: string;
  let publicProject: string;
  const owner = '000000000000000000000001';
  const group = '0000000000000000000000aa';
  const saved = { encryption: process.env.API_KEY_ENCRYPTION_SECRET };

  const keyFor = async (project: string | null, scopes: ('vision:read' | 'vision:write')[] = ['vision:read', 'vision:write']) =>
    (await createApiKey({
      userId: owner, userEmail: 'owner@example.test', userName: 'Owner', name: 'pipeline', scopes,
      project: project ? { id: project, name: 'limited' } : null
    })).token;

  beforeAll(async () => {
    process.env.API_KEY_ENCRYPTION_SECRET = 'project-key-integration-secret';
    resetEncryptionKeyCache();
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/api/projects', projectKeyAuth('vision'), projectRoutes);
    app.use('/api/trainings', projectKeyAuth('vision'), trainingRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    groupsOf.mockReset().mockResolvedValue([{ id: group, name: 'Team' }]);
    await mongoose.connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(owner), email: 'owner@example.test', tokenVersion: 1 });
    [own, otherOwn, shared, publicProject] = (await Project.create([
      { name: 'Own', slug: 'own', owner: { kind: 'user', id: owner }, createdBy: owner },
      { name: 'Other own', slug: 'other-own', owner: { kind: 'user', id: owner }, createdBy: owner },
      // Someone else's, which the owner edits through a group.
      { name: 'Shared', slug: 'shared', owner: { kind: 'user', id: 'someone-else' }, createdBy: 'someone-else', editorGroupIds: [group] },
      { name: 'Public', slug: 'public', owner: { kind: 'user', id: 'someone-else' }, createdBy: 'someone-else', visibility: 'public' }
    ])).map(project => String(project._id));
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });

  afterAll(async () => {
    if (saved.encryption === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
    else process.env.API_KEY_ENCRYPTION_SECRET = saved.encryption;
    resetEncryptionKeyCache();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  const call = async (credential: string, path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${url}/api/${path}`, {
      method, headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as { data: Record<string, unknown> } : { data: {} } };
  };

  it('writes runs into its own project, whatever project the request names', async () => {
    const key = await keyFor(own);
    const created = await call(key, 'trainings', 'POST', { name: 'nightly', projectId: otherOwn });
    expect(created.status).toBe(201);
    expect(String(created.body.data.projectId)).toBe(own);
    expect((await call(key, 'trainings', 'POST', { name: 'nightly' })).status).toBe(201);
    expect(await Training.countDocuments({ projectId: own })).toBe(2);
    expect((await call(key, `projects/${own}`)).status).toBe(200);
  });

  it("reaches no other project: not its owner's others, not a public one", async () => {
    const key = await keyFor(own);
    expect((await call(key, `projects/${otherOwn}`)).status).toBe(403);
    expect((await call(key, `projects/${publicProject}`)).status).toBe(403);
    const listed = (await call(key, 'projects')).body.data as unknown as { _id: string }[];
    expect(listed.map(project => String(project._id))).toEqual([own]);
  });

  it('cannot manage projects, even its own', async () => {
    const key = await keyFor(own);
    expect((await call(key, 'projects', 'POST', { name: 'Escalation' })).status).toBe(403);
    expect((await call(key, `projects/${own}`, 'PUT', { visibility: 'public' })).status).toBe(403);
    expect((await Project.findById(own))?.visibility).toBe('private');
  });

  it("keeps its owner's editor-group access", async () => {
    const key = await keyFor(shared);
    expect((await call(key, 'trainings', 'POST', { name: 'team run' })).status).toBe(201);
    expect(groupsOf).toHaveBeenCalledWith(owner);
  });

  it('loses the project with its owner: removed from the group, the key stops working there', async () => {
    const key = await keyFor(shared);
    groupsOf.mockResolvedValue([]);
    expect((await call(key, 'trainings', 'POST', { name: 'after removal' })).status).toBe(404);
  });

  it('holds its scopes too: a read-only limited key cannot write', async () => {
    const key = await keyFor(own, ['vision:read']);
    expect((await call(key, 'trainings', 'POST', { name: 'nope' })).status).toBe(403);
    expect((await call(key, `projects/${own}`)).status).toBe(200);
  });

  it('leaves an unlimited key reaching whatever its owner can', async () => {
    const key = await keyFor(null);
    expect((await call(key, `projects/${otherOwn}`)).status).toBe(200);
    expect((await call(key, 'trainings', 'POST', { name: 'anywhere', projectId: otherOwn })).status).toBe(201);
  });
});
