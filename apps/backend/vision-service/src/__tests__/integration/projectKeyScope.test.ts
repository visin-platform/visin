import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApiKey, errorHandler, resetEncryptionKeyCache } from '@visin/backend-core';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import { projectKeyAuth } from '../../middleware/projectKeyAuth';
import discoveryRoutes from '../../routes/discoveryRoutes';
import evaluationRoutes from '../../routes/evaluationRoutes';
import modelRoutes from '../../routes/modelRoutes';
import projectRoutes from '../../routes/projectRoutes';
import suiteRoutes from '../../routes/suiteRoutes';
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
  let hidden: string;
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
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/api/projects', projectKeyAuth('vision'), projectRoutes);
    app.use('/api/trainings', projectKeyAuth('vision'), trainingRoutes);
    app.use('/api/models', projectKeyAuth('vision'), modelRoutes);
    app.use('/api/suites', projectKeyAuth('vision'), suiteRoutes);
    app.use('/api/evaluations', projectKeyAuth('vision'), evaluationRoutes);
    app.use('/api/.well-known', projectKeyAuth('vision'), discoveryRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    groupsOf.mockReset().mockResolvedValue([{ id: group, name: 'Team' }]);
    await mongoose.connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(owner), email: 'owner@example.test', tokenVersion: 1 });
    [own, otherOwn, shared, publicProject, hidden] = (await Project.create([
      { name: 'Own', slug: 'own', owner: { kind: 'user', id: owner }, createdBy: owner },
      { name: 'Other own', slug: 'other-own', owner: { kind: 'user', id: owner }, createdBy: owner },
      // Someone else's, which the owner edits through a group.
      { name: 'Shared', slug: 'shared', owner: { kind: 'user', id: 'someone-else' }, createdBy: 'someone-else', editorGroupIds: [group] },
      { name: 'Public', slug: 'public', owner: { kind: 'user', id: 'someone-else' }, createdBy: 'someone-else', visibility: 'public' },
      // Private, and not the owner's at all: the owner cannot read it, so no key of theirs may learn it exists.
      { name: 'Hidden', slug: 'hidden', owner: { kind: 'user', id: 'someone-else' }, createdBy: 'someone-else' }
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

  it("lists only its own project's models, and is refused another project it names", async () => {
    const key = await keyFor(own);
    const model = (repo: string) => [{ provider: 'hf', kind: 'model', repo, revision: 'a'.repeat(40) }];
    await Training.create([
      { uuid: 'own-run', name: 'own', ownerId: owner, projectId: own, models: model('acme/own') },
      { uuid: 'other-run', name: 'other', ownerId: owner, projectId: otherOwn, models: model('acme/other') },
      { uuid: 'public-run', name: 'public', ownerId: 'someone-else', projectId: publicProject, models: model('acme/public') }
    ]);
    const listed = (await call(key, 'models')).body.data as unknown as { models: { model: { repo: string } }[] };
    expect(listed.models.map(row => row.model.repo)).toEqual(['acme/own']);
    expect((await call(key, `models?projectId=${otherOwn}`)).status).toBe(403);
    expect((await call(key, `models?projectId=${publicProject}`)).status).toBe(403);
  });

  it('tells a client what kind of key it is, its scopes and its project, and where the other services are', async () => {
    process.env.PUBLIC_DATASET_API_URL = 'https://datasets.example.test/';
    process.env.SHELL_FRONT_URL = 'https://app.example.test';
    try {
      const pipeline = (await call(await keyFor(own, ['vision:read']), '.well-known/visin')).body.data as unknown as Record<string, unknown>;
      expect(pipeline).toEqual({
        datasetApiUrl: 'https://datasets.example.test',
        appUrl: 'https://app.example.test',
        credential: { kind: 'pipeline-key', scopes: ['vision:read'], label: 'pipeline', project: { id: own, name: 'Own' } }
      });
      const user = (await call(await keyFor(null), '.well-known/visin')).body.data as unknown as { credential: Record<string, unknown> };
      expect(user.credential).toEqual({ kind: 'api-key', scopes: ['vision:read', 'vision:write'], label: 'pipeline' });
    } finally {
      delete process.env.PUBLIC_DATASET_API_URL;
      delete process.env.SHELL_FRONT_URL;
    }
  });

  it('leaves out an address the deployment has not configured, and names no project when its key outlived it', async () => {
    const key = await keyFor(own);
    await Project.deleteOne({ _id: own });
    const body = (await call(key, '.well-known/visin')).body.data as unknown as Record<string, unknown>;
    expect(body).not.toHaveProperty('datasetApiUrl');
    expect(body).not.toHaveProperty('appUrl');
    expect(body.credential).toMatchObject({ kind: 'pipeline-key', project: { id: own, name: '' } });
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
  describe('suites', () => {
    const suite = (projectId: string, slug = 'road-test') => ({
      slug, version: 1, name: 'Road test', projectId,
      protocol: {
        task: 'segmentation', data: { kind: 'external', label: 'x', manifestSha256: 'a'.repeat(64) }, split: 'test',
        conditions: [{ name: 'day', sampleCount: 10 }], metrics: [{ key: 'm', direction: 'max', headline: true }],
        aggregation: 'equal-mean-of-conditions', evaluator: { package: 'p' }
      }
    });

    it('publishes to its own project and to no other, even one its owner may write to', async () => {
      const key = await keyFor(own);
      expect((await call(key, 'suites', 'POST', suite(own))).status).toBe(201);
      expect((await call(key, 'suites', 'POST', suite(otherOwn, 'other'))).status).toBe(403);
      expect((await call(key, 'suites', 'POST', suite(shared, 'shared'))).status).toBe(403);
      expect(await mongoose.connection.collection('suites').countDocuments()).toBe(1);
    });

    it('allows a managing pipeline actor to share only within its project, and requires write scope', async () => {
      const key = await keyFor(own);
      expect((await call(key, 'suites', 'POST', { ...suite(own), visibility: 'public' })).status).toBe(201);
      expect((await call(key, 'suites', 'POST', { ...suite(own), version: 2 })).body.data.visibility).toBe('public');
      expect((await call(key, 'suites', 'POST', { ...suite(otherOwn, 'elsewhere'), visibility: 'public' })).status).toBe(403);
      const readOnly = await keyFor(own, ['vision:read']);
      expect((await call(readOnly, 'suites', 'POST', { ...suite(own), version: 3, visibility: 'public' })).status).toBe(403);
    });

    it('keeps an editor-group pipeline actor at contribute when explicitly or implicitly sharing a new protocol', async () => {
      const key = await keyFor(shared);
      expect((await call(key, 'suites', 'POST', { ...suite(shared), visibility: 'public' })).status).toBe(403);
      expect((await call(key, 'suites', 'POST', suite(shared))).status).toBe(201);
      // A manager later makes the existing version public; contributor retries stay idempotent.
      await mongoose.connection.collection('suites').updateOne({ slug: 'road-test', version: 1 }, { $set: { visibility: 'public' } });
      expect((await call(key, 'suites', 'POST', suite(shared))).status).toBe(200);
      expect((await call(key, 'suites', 'POST', { ...suite(shared), version: 2 })).status).toBe(403);
      expect((await call(key, 'suites', 'POST', { ...suite(shared), version: 2, visibility: 'private' })).status).toBe(201);
    });

    it('tells a project it cannot read apart from none at all only when its owner could read it', async () => {
      const key = await keyFor(own);
      const missing = String(new mongoose.Types.ObjectId());
      // The owner can read their other project, so the key is told its own limit.
      expect((await call(key, 'suites', 'POST', suite(otherOwn, 'other'))).status).toBe(403);
      // A project the owner cannot read reads exactly as one that does not exist.
      expect((await call(key, 'suites', 'POST', suite(hidden, 'hidden'))).status).toBe(404);
      expect((await call(key, 'suites', 'POST', suite(missing, 'missing'))).status).toBe(404);
    });

    it('lists its own suites and public ones, never another project\'s private suite', async () => {
      const unlimited = await keyFor(null);
      await call(unlimited, 'suites', 'POST', suite(otherOwn, 'private-elsewhere'));
      await call(unlimited, 'suites', 'POST', { ...suite(otherOwn, 'public-elsewhere'), visibility: 'public' });
      const key = await keyFor(own);
      await call(key, 'suites', 'POST', suite(own, 'mine'));
      const listed = (await call(key, 'suites')).body.data as unknown as { suites: { slug: string }[] };
      expect(listed.suites.map(item => item.slug).sort()).toEqual(['mine', 'public-elsewhere']);
      expect((await call(key, 'suites/private-elsewhere/1')).status).toBe(404);
      expect((await call(key, 'suites/public-elsewhere/1')).status).toBe(200);
    });

    it('cannot change a suite of another project, public or not', async () => {
      const unlimited = await keyFor(null);
      await call(unlimited, 'suites', 'POST', { ...suite(otherOwn, 'public-elsewhere'), visibility: 'public' });
      const key = await keyFor(own);
      expect((await call(key, 'suites/public-elsewhere/1', 'PATCH', { name: 'mine now' })).status).toBe(403);
      expect((await call(key, 'suites/public-elsewhere/1', 'PATCH', { archived: true })).status).toBe(403);
    });

    it('does not publish with a read-only key', async () => {
      const readOnly = await keyFor(own, ['vision:read']);
      expect((await call(readOnly, 'suites', 'POST', suite(own))).status).toBe(403);
      expect((await call(readOnly, 'suites')).status).toBe(200);
    });
  });

  describe('evaluations', () => {
    const body = (projectId: string) => ({ projectId, results: { day: { overall: { m: 1 } } } });

    it('records into its own project, is told its limit for the owner\'s others, and learns nothing of a project it cannot read', async () => {
      const key = await keyFor(own);
      expect((await call(key, 'evaluations', 'POST', body(own))).status).toBe(201);
      expect((await call(key, 'evaluations', 'POST', body(otherOwn))).status).toBe(403);
      const missing = String(new mongoose.Types.ObjectId());
      expect((await call(key, 'evaluations', 'POST', body(hidden))).status).toBe(404);
      expect((await call(key, 'evaluations', 'POST', body(missing))).status).toBe(404);
      expect((await call(key, 'evaluations/check', 'POST', body(hidden))).status).toBe(404);
    });
  });
});
