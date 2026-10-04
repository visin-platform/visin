import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, recordResourceEvent } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Project from '../../models/Project';
import Suite from '../../models/Suite';
import SuiteSlug from '../../models/SuiteSlug';
import suiteRoutes from '../../routes/suiteRoutes';
import { purgeExpiredTrash, purgeProject } from '../../services/purgeService';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
const membership = jest.fn();
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  recordResourceEvent: jest.fn(),
  createGroupServiceClient: () => ({ checkMembership: membership, getMyGroups: jest.fn(async () => []) })
}));

const OWNER = '000000000000000000000001';
const ADMIN = '000000000000000000000002';
const MEMBER = '000000000000000000000003';
const STRANGER = '000000000000000000000004';
const GROUP = '0000000000000000000000aa';
const ROLES: Record<string, { id: string; name: string; role: 'owner' | 'admin' | 'member' }[]> = {
  [OWNER]: [{ id: GROUP, name: 'Team', role: 'owner' }],
  [ADMIN]: [{ id: GROUP, name: 'Team', role: 'admin' }],
  [MEMBER]: [{ id: GROUP, name: 'Team', role: 'member' }]
};
const ANONYMOUS = '';

const protocol = (overrides: Record<string, unknown> = {}) => ({
  task: 'semantic-segmentation',
  data: { kind: 'external', label: 'Road test frames', manifestSha256: 'a'.repeat(64) },
  split: 'test',
  conditions: [{ name: 'day', sampleCount: 120 }, { name: 'night', sampleCount: 100 }],
  metrics: [{ key: 'mIoU_foreground', direction: 'max', range: { min: 0, max: 1 }, headline: true }],
  aggregation: 'equal-mean-of-conditions',
  evaluator: { package: 'visin-fusion' },
  ...overrides
});

describe('suites with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'suites-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    await Suite.init();
    await SuiteSlug.init();
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/suites', suiteRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    jest.mocked(recordResourceEvent).mockClear();
    const ids = [OWNER, ADMIN, MEMBER, STRANGER].map(id => new mongoose.Types.ObjectId(id));
    await mongoose.connection.collection('users').insertMany(ids.map(_id => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection.collection('user_sessions').insertMany(ids.map(_id => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    jest.mocked(getUserGroups).mockImplementation(async userId => ROLES[userId ?? ''] ?? []);
    membership.mockImplementation(async (_group: string, userId: string) => {
      const role = ROLES[userId]?.[0]?.role;
      return role ? { member: true, role } : { member: false, role: null };
    });
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Body = { data: any; message?: string };
  const call = async (path: string, { method = 'GET', user = OWNER, body }: { method?: string; user?: string; body?: unknown } = {}) => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: user, email: `${user}@example.test`, tokenVersion: 1, sid: user, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
  };
  const project = async (fields: Record<string, unknown> = {}) =>
    String((await Project.create({ name: 'Team project', slug: `team-${new mongoose.Types.ObjectId()}`, owner: { kind: 'group', id: GROUP }, createdBy: OWNER, ...fields }))._id);
  const publish = (projectId: string, overrides: Record<string, unknown> = {}, user = OWNER) =>
    call('/suites', { method: 'POST', user, body: { slug: 'road-test', version: 1, name: 'Road test', projectId, protocol: protocol(), ...overrides } });

  describe('publishing', () => {
    it('stores the protocol with its digest and reads it back by number and as latest', async () => {
      const id = await project();
      const created = await publish(id);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ slug: 'road-test', version: 1, projectId: id, visibility: 'private', createdBy: OWNER });
      expect(created.body.data.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(created.body.data.protocol.classes).toEqual([]);

      expect((await call('/suites/road-test/1')).body.data._id).toBe(created.body.data._id);
      expect((await call('/suites/road-test/latest')).body.data.version).toBe(1);
    });

    it('answers the same protocol again with the stored suite, and refuses a different one under a taken version', async () => {
      const id = await project();
      const first = await publish(id);
      const again = await publish(id, { name: 'Renamed in the push', description: 'ignored: the suite exists' });
      expect(again.status).toBe(200);
      expect(again.body.data._id).toBe(first.body.data._id);
      expect(again.body.data.name).toBe('Road test');

      const changed = await publish(id, { protocol: protocol({ split: 'val' }) });
      expect(changed.status).toBe(409);
      expect(changed.body.message).toContain('publish it as version 2');

      const next = await publish(id, { version: 2, protocol: protocol({ split: 'val' }) });
      expect(next.status).toBe(201);
      expect(next.body.data.digest).not.toBe(first.body.data.digest);
      expect((await call('/suites/road-test/latest')).body.data.version).toBe(2);
    });

    it('treats a reordered protocol as the same one', async () => {
      const id = await project();
      await publish(id);
      const reordered = await publish(id, { protocol: protocol({ conditions: [{ name: 'night', sampleCount: 100 }, { name: 'day', sampleCount: 120 }] }) });
      expect(reordered.status).toBe(200);
    });

    it('lets one of two simultaneous publishes win and answers the other from the stored suite', async () => {
      const id = await project();
      const same = await Promise.all([publish(id), publish(id)]);
      expect(same.map(result => result.status).sort()).toEqual([200, 201]);
      expect(await Suite.countDocuments()).toBe(1);

      const rival = await Promise.all([publish(id, { version: 2 }), publish(id, { version: 2, protocol: protocol({ split: 'val' }) })]);
      expect(rival.map(result => result.status).sort()).toEqual([201, 409]);
      expect(await Suite.countDocuments()).toBe(2);
    });

    it('keeps a name to the project that first used it', async () => {
      const first = await project();
      const second = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      await publish(first);
      const taken = await publish(second, { version: 2 }, STRANGER);
      expect(taken.status).toBe(409);
      expect(taken.body.message).toContain('belongs to another project');
      expect((await publish(second, {}, STRANGER)).status).toBe(409);
      expect(await Suite.countDocuments()).toBe(1);
    });

    it('atomically reserves ownership when different projects race to publish different versions', async () => {
      const first = await project();
      const second = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      const create = SuiteSlug.create.bind(SuiteSlug);
      let arrivals = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      // Both requests have checked the empty version collection before either can claim the name.
      const claim = jest.spyOn(SuiteSlug, 'create').mockImplementation((async (doc: { _id: string; projectId: string }) => {
        if (++arrivals === 2) release();
        await gate;
        return create(doc);
      }) as typeof SuiteSlug.create);
      try {
        const results = await Promise.all([publish(first), publish(second, { version: 2 }, STRANGER)]);
        expect(results.map(result => result.status).sort()).toEqual([201, 409]);
        const winner = await Suite.findOne().orFail();
        expect(await Suite.distinct('projectId')).toEqual([winner.projectId]);
        expect((await SuiteSlug.findById('road-test'))?.projectId).toBe(winner.projectId);
      } finally { claim.mockRestore(); }
    });

    it('allows concurrent different versions within the same project', async () => {
      const id = await project();
      const results = await Promise.all([1, 2, 3, 4].map(version => publish(id, { version })));
      expect(results.map(result => result.status)).toEqual([201, 201, 201, 201]);
      expect(await Suite.countDocuments()).toBe(4);
      expect(await SuiteSlug.countDocuments()).toBe(1);
      expect((await publish(id, { version: 3 })).status).toBe(200);
    });

    it('protects legacy ownership before lazily reserving it on an identical retry', async () => {
      const id = await project();
      const other = await project();
      await publish(id);
      await SuiteSlug.deleteMany({});
      expect((await publish(other, { version: 2 })).status).toBe(409);
      expect(await SuiteSlug.countDocuments()).toBe(0);
      expect((await publish(id)).status).toBe(200);
      expect((await SuiteSlug.findById('road-test'))?.projectId).toBe(id);
    });

    it('refuses ambiguous legacy ownership without rewriting versions or purging their project', async () => {
      const first = await project();
      const second = await project();
      await publish(first);
      const seed = (await Suite.findOne().orFail()).toObject();
      await Suite.create({ ...seed, _id: new mongoose.Types.ObjectId(), version: 2, projectId: second });
      await SuiteSlug.deleteMany({});
      for (const id of [first, second]) {
        const response = await publish(id, { version: 3 });
        expect(response.status).toBe(409);
      }
      const retry = await publish(first);
      expect(retry.status).toBe(409);
      expect(retry.body.message).toContain('conflicting historical ownership');
      await expect(purgeProject(await Project.findById(first).orFail())).rejects.toThrow('conflicting historical ownership');
      expect(await Suite.countDocuments()).toBe(2);
      expect(await Project.countDocuments()).toBe(2);
      expect(await SuiteSlug.countDocuments()).toBe(0);
    });

    it('lets the trash sweep carry on past a project it cannot purge, and still purges the others', async () => {
      const stuck = await project();
      const second = await project();
      const fine = await project();
      await publish(stuck);
      const seed = (await Suite.findOne().orFail()).toObject();
      await Suite.create({ ...seed, _id: new mongoose.Types.ObjectId(), version: 2, projectId: second });
      await SuiteSlug.deleteMany({});
      const old = new Date(Date.now() - 31 * 86_400_000);
      await Project.updateMany({ _id: { $in: [stuck, fine] } }, { trashedAt: old });
      const swept = await purgeExpiredTrash();
      expect(swept.projects).toBe(1);
      expect(await Project.findById(fine)).toBeNull();
      expect(await Project.findById(stuck)).not.toBeNull();
    });

    it('keeps a claim after a failed version insert, allowing only the original project to retry', async () => {
      const id = await project();
      const other = await project();
      const insert = jest.spyOn(Suite, 'create').mockRejectedValueOnce(new Error('temporary insert failure'));
      try { expect((await publish(id, { visibility: 'public' })).status).toBe(500); }
      finally { insert.mockRestore(); }
      expect(recordResourceEvent).not.toHaveBeenCalled();
      expect(await Suite.countDocuments()).toBe(0);
      expect((await SuiteSlug.findById('road-test'))?.projectId).toBe(id);
      expect((await publish(other, { version: 2 })).status).toBe(409);
      expect((await publish(id)).status).toBe(201);
    });

    it('retains a legacy name reservation after purging all of its versions', async () => {
      const id = await project();
      const other = await project();
      await publish(id);
      await SuiteSlug.deleteMany({});
      await purgeProject(await Project.findById(id).orFail());
      expect(await Suite.countDocuments()).toBe(0);
      expect((await SuiteSlug.findById('road-test'))?.projectId).toBe(id);
      expect((await publish(other)).status).toBe(409);
      expect((await call('/suites/road-test/1', { user: ANONYMOUS })).status).toBe(404);
    });

    it('starts a later version as visible as the one before it', async () => {
      const id = await project();
      await publish(id, { visibility: 'public' });
      expect((await publish(id, { version: 2, protocol: protocol({ split: 'val' }) })).body.data.visibility).toBe('public');
      expect((await publish(id, { version: 3, visibility: 'private', protocol: protocol({ split: 'x' }) })).body.data.visibility).toBe('private');
    });

    it.each(['private', 'public'])('requires manage to create a public protocol in a %s project, but accepts private contributor protocols', async visibility => {
      const id = await project({ visibility });
      const refused = await publish(id, { visibility: 'public' }, MEMBER);
      expect(refused.status).toBe(403);
      expect(refused.body.message).toContain('Manage access');
      expect(await Suite.countDocuments()).toBe(0);
      expect(await SuiteSlug.countDocuments()).toBe(0);
      expect(recordResourceEvent).not.toHaveBeenCalled();

      const accepted = await publish(id, { visibility: 'private' }, MEMBER);
      expect(accepted.status).toBe(201);
      expect(accepted.body.data).toMatchObject({ visibility: 'private', createdBy: MEMBER });
      expect(recordResourceEvent).not.toHaveBeenCalled();
    });

    it('checks inherited public visibility and inherits from the highest version after an explicit private override', async () => {
      const id = await project();
      await publish(id, { visibility: 'public' }, ADMIN);
      const second = { version: 2, protocol: protocol({ split: 'val' }) };
      expect((await publish(id, second, MEMBER)).status).toBe(403);
      expect(await Suite.countDocuments()).toBe(1);

      expect((await publish(id, { ...second, visibility: 'private' }, MEMBER)).status).toBe(201);
      const third = await publish(id, { version: 3, protocol: protocol({ split: 'holdout' }) }, MEMBER);
      expect(third.status).toBe(201);
      expect(third.body.data.visibility).toBe('private');
      expect((await publish(id, { version: 4, visibility: 'public' }, MEMBER)).status).toBe(403);
      expect(recordResourceEvent).toHaveBeenCalledTimes(1);
    });

    it('audits initial public disclosure once under concurrent retries, and lets contributors replay without changing visibility', async () => {
      const id = await project();
      const responses = await Promise.all([
        publish(id, { visibility: 'public' }, ADMIN),
        publish(id, { visibility: 'public' }, ADMIN)
      ]);
      expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
      expect(recordResourceEvent).toHaveBeenCalledTimes(1);
      expect(recordResourceEvent).toHaveBeenCalledWith({
        service: 'vision-service', resourceType: 'suite', resourceId: responses[0].body.data._id,
        resourceName: 'road-test@1', action: 'visibility', actorId: ADMIN,
        owner: expect.objectContaining({ kind: 'group', id: GROUP }), visibility: 'public'
      });

      const retry = await publish(id, { visibility: 'private', name: 'ignored' }, MEMBER);
      expect(retry.status).toBe(200);
      expect(retry.body.data).toMatchObject({ _id: responses[0].body.data._id, name: 'Road test', visibility: 'public' });
      expect(recordResourceEvent).toHaveBeenCalledTimes(1);
      const inherited = await publish(id, { version: 2 }, ADMIN);
      expect(inherited.status).toBe(201);
      expect(inherited.body.data.visibility).toBe('public');
      expect(recordResourceEvent).toHaveBeenCalledTimes(2);
    });

    it('needs a login and contribute access, and does not confirm a private project to a stranger', async () => {
      const id = await project();
      expect((await publish(id, {}, ANONYMOUS)).status).toBe(401);
      expect((await publish(id, {}, STRANGER)).status).toBe(404);
      expect((await publish('000000000000000000000999')).status).toBe(404);

      const open = await project({ visibility: 'public' });
      expect((await publish(open, {}, STRANGER)).status).toBe(403);
      expect((await publish(id, {}, MEMBER)).status).toBe(201);
      expect(await Suite.countDocuments()).toBe(1);
    });

    it('refuses a protocol that is not valid', async () => {
      const id = await project();
      for (const bad of [protocol({ conditions: [] }), protocol({ notes: 'x' }), { ...protocol(), data: { kind: 'hf', repo: 'a/b', commit: 'main' } }]) {
        expect((await publish(id, { protocol: bad })).status).toBe(400);
      }
      expect((await publish(id, { slug: 'Not A Slug' })).status).toBe(400);
      expect((await publish(id, { version: 0 })).status).toBe(400);
    });
  });

  describe('who can read', () => {
    it('hides a private suite from strangers and anonymous callers, as if it did not exist', async () => {
      const id = await project();
      await publish(id);
      expect((await call('/suites/road-test/1', { user: STRANGER })).status).toBe(404);
      expect((await call('/suites/road-test/1', { user: ANONYMOUS })).status).toBe(404);
      expect((await call('/suites/road-test/1', { user: MEMBER })).status).toBe(200);
      expect((await call('/suites', { user: STRANGER })).body.data.suites).toEqual([]);
      expect((await call('/suites/nope/1', { user: MEMBER })).status).toBe(404);
    });

    it('shows a suite of a public project to anyone', async () => {
      const id = await project({ visibility: 'public' });
      await publish(id);
      expect((await call('/suites/road-test/1', { user: ANONYMOUS })).status).toBe(200);
      expect((await call('/suites', { user: STRANGER })).body.data.suites).toHaveLength(1);
    });

    it('shows a public suite of a private project to anyone, and nothing else about the project', async () => {
      const id = await project();
      await publish(id, { visibility: 'public' });
      const anonymous = await call('/suites/road-test/1', { user: ANONYMOUS });
      expect(anonymous.status).toBe(200);
      expect((await call('/suites', { user: ANONYMOUS })).body.data.suites).toHaveLength(1);
      expect((await call('/suites', { user: STRANGER, method: 'GET' })).body.data.suites).toHaveLength(1);
      expect((await call('/suites/road-test/1', { method: 'PATCH', user: STRANGER, body: { name: 'mine' } })).status).toBe(403);
    });

    it('hides the suites of a trashed project, public or not', async () => {
      const id = await project();
      await publish(id, { visibility: 'public' });
      await Project.updateOne({ _id: id }, { trashedAt: new Date() });
      expect((await call('/suites/road-test/1', { user: ANONYMOUS })).status).toBe(404);
      expect((await call('/suites/road-test/1', { user: OWNER })).status).toBe(404);
      expect((await call('/suites', { user: ANONYMOUS })).body.data.suites).toEqual([]);
      expect((await call('/suites', { user: OWNER })).body.data.suites).toEqual([]);
    });

    it('filters by name and project, orders versions, and pages', async () => {
      const a = await project();
      const b = await project({ owner: { kind: 'user', id: OWNER }, slug: 'other' });
      await publish(a);
      await publish(a, { version: 2, protocol: protocol({ split: 'val' }) });
      await publish(b, { slug: 'depth' });
      const all = await call('/suites');
      expect(all.body.data.suites.map((suite: { slug: string; version: number }) => `${suite.slug}@${suite.version}`)).toEqual(['depth@1', 'road-test@2', 'road-test@1']);
      expect((await call('/suites?order=asc')).body.data.suites.map((suite: { version: number }) => suite.version)).toEqual([1, 1, 2]);
      expect((await call('/suites?slug=road-test')).body.data.suites).toHaveLength(2);
      expect((await call(`/suites?projectId=${b}`)).body.data.suites).toHaveLength(1);
      expect((await call('/suites?projectId=nowhere')).body.data.suites).toEqual([]);
      const paged = await call('/suites?limit=2&page=2');
      expect(paged.body.data.suites).toHaveLength(1);
      expect(paged.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });
    });
  });

  describe('changing a suite', () => {
    it('lets a contributor reword their own, but sharing and others\' suites need manage', async () => {
      const id = await project();
      await publish(id, {}, MEMBER);
      const renamed = await call('/suites/road-test/1', { method: 'PATCH', user: MEMBER, body: { name: 'Road test (day/night)', description: 'Two conditions' } });
      expect(renamed.body.data).toMatchObject({ name: 'Road test (day/night)', description: 'Two conditions' });
      expect((await call('/suites/road-test/1', { method: 'PATCH', user: MEMBER, body: { visibility: 'public' } })).status).toBe(403);

      await publish(id, { slug: 'by-owner' }, OWNER);
      expect((await call('/suites/by-owner/1', { method: 'PATCH', user: MEMBER, body: { name: 'taken over' } })).status).toBe(403);
      expect((await call('/suites/by-owner/1', { method: 'PATCH', user: ADMIN, body: { visibility: 'public', description: null } })).body.data.visibility).toBe('public');
      expect((await call('/suites/by-owner/1', { method: 'PATCH', user: STRANGER, body: { name: 'x' } })).status).toBe(403);
    });

    it('never changes the protocol, and refuses an empty change', async () => {
      const id = await project();
      const created = await publish(id);
      const attempt = await call('/suites/road-test/1', { method: 'PATCH', body: { protocol: protocol({ split: 'val' }) } });
      expect(attempt.status).toBe(400);
      await call('/suites/road-test/1', { method: 'PATCH', body: { name: 'Reworded' } });
      const stored = (await call('/suites/road-test/1')).body.data;
      expect(stored.digest).toBe(created.body.data.digest);
      expect(stored.protocol.split).toBe('test');
    });

    it('archives a suite out of the default views and out of latest, and brings it back', async () => {
      const id = await project();
      await publish(id);
      await publish(id, { version: 2, protocol: protocol({ split: 'val' }) });
      const archived = await call('/suites/road-test/2', { method: 'PATCH', body: { archived: true } });
      expect(archived.body.data.archivedAt).toBeTruthy();
      expect((await call('/suites/road-test/latest')).body.data.version).toBe(1);
      expect((await call('/suites')).body.data.suites).toHaveLength(1);
      expect((await call('/suites?includeArchived=true')).body.data.suites).toHaveLength(2);
      expect((await call('/suites/road-test/2')).status).toBe(200);

      const again = await call('/suites/road-test/2', { method: 'PATCH', body: { archived: true } });
      expect(again.body.data.archivedAt).toBe(archived.body.data.archivedAt);
      expect((await call('/suites/road-test/2', { method: 'PATCH', body: { archived: false } })).body.data.archivedAt).toBeUndefined();
      expect((await call('/suites/road-test/latest')).body.data.version).toBe(2);
    });

    it('needs a login, and a concrete version', async () => {
      const id = await project();
      await publish(id);
      expect((await call('/suites/road-test/1', { method: 'PATCH', user: ANONYMOUS, body: { name: 'x' } })).status).toBe(401);
      expect((await call('/suites/road-test/latest', { method: 'PATCH', body: { name: 'x' } })).status).toBe(400);
      expect((await call('/suites/road-test/9', { method: 'PATCH', body: { name: 'x' } })).status).toBe(404);
    });
  });
});
