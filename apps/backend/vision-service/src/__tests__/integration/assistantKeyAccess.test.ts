import { vi, type Mock } from 'vitest';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApiKey, errorHandler, resetEncryptionKeyCache } from '@visin/backend-core';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import { projectKeyAuth } from '../../middleware/projectKeyAuth';
import projectRoutes from '../../routes/projectRoutes';
import suiteRoutes from '../../routes/suiteRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import publicRoutes from '../../routes/publicRoutes';
import Project from '../../models/Project';
import Suite from '../../models/Suite';
import Training from '../../models/Training';
import Paper from '../../models/Paper';
import { getUserGroups } from '../../clients/projectGroupsClient';

vi.mock('../../clients/projectGroupsClient', async () => {
  const module = await (() => ({ getUserGroups: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
const groupsOf = getUserGroups as Mock;

/**
 * The key Vivi acts with: the asker's own, read-only, not limited to a project. Whatever it finds by searching is
 * decided by vision-service's own access checks, so these go through them over HTTP rather than assuming them.
 */
describe("an assistant's read-only key, through HTTP and in-memory MongoDB", () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  let token: string;
  const asker = '000000000000000000000001';
  const other = '000000000000000000000002';
  const group = '0000000000000000000000aa';
  const saved = { encryption: process.env.API_KEY_ENCRYPTION_SECRET };
  const ids: Record<'own' | 'open' | 'team' | 'hidden', string> = { own: '', open: '', team: '', hidden: '' };

  beforeAll(async () => {
    process.env.API_KEY_ENCRYPTION_SECRET = 'assistant-key-integration-secret';
    resetEncryptionKeyCache();
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([Project.syncIndexes(), Training.syncIndexes(), Suite.syncIndexes()]);
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/api/projects', projectKeyAuth('vision'), projectRoutes);
    app.use('/api/trainings', projectKeyAuth('vision'), trainingRoutes);
    app.use('/api/suites', projectKeyAuth('vision'), suiteRoutes);
    app.use('/api/public', publicRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    groupsOf.mockReset().mockResolvedValue([{ id: group, name: 'Team' }]);
    await mongoose.connection.collection('users').insertMany(
      [asker, other].map((id) => ({
        _id: new mongoose.Types.ObjectId(id),
        email: `${id}@example.test`,
        tokenVersion: 1
      }))
    );
    // The same words on all four, so only access decides which ones a search for them returns.
    const [own, open, team, hidden] = await Project.create([
      { name: 'Driving own', slug: 'driving-own', owner: { kind: 'user', id: asker }, createdBy: asker },
      {
        name: 'Driving open',
        slug: 'driving-open',
        owner: { kind: 'user', id: other },
        createdBy: other,
        visibility: 'public'
      },
      {
        name: 'Driving team',
        slug: 'driving-team',
        owner: { kind: 'user', id: other },
        createdBy: other,
        editorGroupIds: [group]
      },
      { name: 'Driving secret', slug: 'driving-secret', owner: { kind: 'user', id: other }, createdBy: other }
    ]);
    Object.assign(ids, {
      own: String(own._id),
      open: String(open._id),
      team: String(team._id),
      hidden: String(hidden._id)
    });
    await Training.create(
      Object.entries(ids).map(([name, projectId]) => ({
        uuid: `run-${name}`,
        name: `driving run ${name}`,
        ownerId: name === 'own' ? asker : other,
        projectId
      }))
    );
    const suite = (projectId: string, slug: string, visibility: 'private' | 'public') => ({
      slug,
      version: 1,
      name: `Road ${slug}`,
      projectId,
      visibility,
      createdBy: other,
      digest: slug.padEnd(64, '0'),
      protocol: {
        task: 'driving',
        data: { kind: 'external', label: 'x', manifestSha256: 'a'.repeat(64) },
        split: 'test',
        conditions: [{ name: 'day', sampleCount: 10 }],
        metrics: [{ key: 'm', direction: 'max', headline: true }],
        aggregation: 'equal-mean-of-conditions',
        evaluator: { package: 'p' }
      }
    });
    await Suite.create([
      suite(ids.own, 'own-suite', 'private'),
      suite(ids.team, 'team-suite', 'private'),
      suite(ids.hidden, 'secret-suite', 'private'),
      suite(ids.hidden, 'open-suite', 'public')
    ]);
    token = (
      await createApiKey({
        userId: asker,
        userEmail: `${asker}@example.test`,
        userName: 'Asker',
        name: 'vivi',
        scopes: ['vision:read'],
        project: null
      })
    ).token;
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    if (saved.encryption === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
    else process.env.API_KEY_ENCRYPTION_SECRET = saved.encryption;
    resetEncryptionKeyCache();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  const call = async (path: string) => {
    const response = await fetch(`${url}/api/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await response.text();
    return { status: response.status, data: (text ? JSON.parse(text).data : undefined) as unknown };
  };
  const projectNames = async (search: string) =>
    ((await call(`projects?search=${search}`)).data as { name: string }[]).map((row) => row.name).sort();
  const runNames = async (search: string) =>
    ((await call(`trainings?search=${search}`)).data as { trainings: { name: string }[] }).trainings
      .map((row) => row.name)
      .sort();

  it("finds the asker's own, the public and the group's projects, and never another person's private one", async () => {
    expect(await projectNames('driving')).toEqual(['Driving open', 'Driving own', 'Driving team']);
  });

  it("finds runs by the same rule: a private project's runs are not found by their words", async () => {
    expect(await runNames('driving')).toEqual(['driving run open', 'driving run own', 'driving run team']);
  });

  it("refuses another person's private project by id, without saying anything about it", async () => {
    const response = await fetch(`${url}/api/projects/${ids.hidden}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(404);
    const text = await response.text();
    const missing = await fetch(`${url}/api/projects/${'f'.repeat(24)}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(text);
    expect(text).not.toContain('Driving secret');
    expect(text).not.toContain(other);
    expect((await call(`projects/${ids.open}`)).status).toBe(200);
    expect((await call(`projects/${ids.own}`)).status).toBe(200);
  });

  it("does not hand over a private project's run by id either", async () => {
    const hiddenRun = await Training.findOne({ uuid: 'run-hidden' });
    const hidden = await call(`trainings/${hiddenRun!._id}`);
    expect(hidden.status).toBe(404);
    expect((await call(`trainings/${'f'.repeat(24)}`)).status).toBe(404);
    const ownRun = await Training.findOne({ uuid: 'run-own' });
    expect((await call(`trainings/${ownRun!._id}`)).status).toBe(200);
  });

  it('keeps public project and run reads public even when sent the owner’s key', async () => {
    const ownRun = await Training.findOne({ uuid: 'run-own' });
    const openRun = await Training.findOne({ uuid: 'run-open' });
    expect([403, 404]).toContain((await call(`public/projects/${ids.own}`)).status);
    expect([403, 404]).toContain((await call(`public/trainings/${ownRun!._id}/summary`)).status);
    expect((await call(`public/projects/${ids.open}`)).status).toBe(200);
    expect((await call(`public/trainings/${openRun!._id}/summary`)).status).toBe(200);
    const rows = (await call('public/trainings?search=driving')).data as { trainings: { name: string }[] };
    expect(rows.trainings.map((row) => row.name)).toEqual(['driving run open']);
    expect([403, 404]).toContain((await call(`public/papers/${ids.own}`)).status);
    const paper = await Paper.create({ title: 'Open paper', owner: { kind: 'user', id: other }, createdBy: other, visibility: 'public' });
    expect((await call(`public/papers/${paper._id}`)).status).toBe(200);
    expect([403, 404]).toContain((await call('public/visualizations/training/run-own')).status);
    expect((await call('public/visualizations/training/run-open')).status).toBe(200);
  });

  it("loses a group's project the moment the asker leaves the group", async () => {
    groupsOf.mockResolvedValue([]);
    expect(await projectNames('driving')).toEqual(['Driving open', 'Driving own']);
    expect(await runNames('driving')).toEqual(['driving run open', 'driving run own']);
    expect((await call(`projects/${ids.team}`)).status).toBe(404);
  });

  const suiteSlugs = async () =>
    ((await call('suites?limit=100')).data as { suites: { slug: string }[] }).suites.map((row) => row.slug).sort();

  it("lists the suites of what the asker can read, and a public one, never a private project's", async () => {
    expect(await suiteSlugs()).toEqual(['open-suite', 'own-suite', 'team-suite']);
    groupsOf.mockResolvedValue([]);
    expect(await suiteSlugs()).toEqual(['open-suite', 'own-suite']);
  });

  it("reads a private project's suite and its leaderboard as not allowed, and a public one as allowed", async () => {
    expect((await call('suites/own-suite/1')).status).toBe(200);
    expect((await call('suites/open-suite/1')).status).toBe(200);
    expect((await call('suites/open-suite/1/leaderboard')).status).toBe(200);
    for (const path of ['suites/secret-suite/1', 'suites/secret-suite/1/leaderboard']) {
      const response = await fetch(`${url}/api/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      expect([403, 404]).toContain(response.status);
      expect(await response.text()).not.toContain('Road secret-suite');
    }
  });

  it('searches suites by their words, among only what the asker may read', async () => {
    const found = async (search: string) =>
      ((await call(`suites?search=${encodeURIComponent(search)}`)).data as { suites: { slug: string }[] }).suites
        .map((row) => row.slug)
        .sort();
    expect(await found('road')).toEqual(['open-suite', 'own-suite', 'team-suite']);
    // The task is searched too, and a pattern typed in is only text.
    expect(await found('DRIVING')).toEqual(['open-suite', 'own-suite', 'team-suite']);
    expect(await found('secret')).toEqual([]);
    expect(await found('.*')).toEqual([]);
    groupsOf.mockResolvedValue([]);
    expect(await found('road')).toEqual(['open-suite', 'own-suite']);
  });

  it('is read-only: it cannot change a project it can read', async () => {
    const response = await fetch(`${url}/api/projects/${ids.own}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'public' })
    });
    expect(response.status).toBe(403);
    expect((await Project.findById(ids.own))?.visibility).toBe('private');
  });
});
