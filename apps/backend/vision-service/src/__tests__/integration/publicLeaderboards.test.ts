import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHash, createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Evaluation from '../../models/Evaluation';
import Project from '../../models/Project';
import Suite from '../../models/Suite';
import { recordTest } from '../fixtures/recordedTest';
import Training from '../../models/Training';
import evaluationRoutes from '../../routes/evaluationRoutes';
import projectRoutes from '../../routes/projectRoutes';
import publicRoutes from '../../routes/publicRoutes';
import suiteRoutes from '../../routes/suiteRoutes';
import { invalidatePublic } from '../../services/publicCache';
import { approveEvaluation, hideEvaluation, listSubmissions, unhideEvaluation } from '../../services/moderationService';
import { projectTokenContext } from '../../middleware/projectTokenContext';
import { protocolDigest } from '../../services/suiteProtocol';
import { suiteProtocolSchema } from '../../validation/suiteSchemas';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
const membership = jest.fn();
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
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
const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const local = (name: string) => ({ kind: 'local', sha256: sha(name), label: name });
const protocol = (overrides: Record<string, unknown> = {}) => ({
  task: 'segmentation',
  data: { kind: 'external', label: 'Road frames', manifestSha256: 'a'.repeat(64) },
  split: 'test',
  conditions: [{ name: 'day', sampleCount: 10 }, { name: 'night', sampleCount: 5 }],
  metrics: [{ key: 'm', direction: 'max', unit: 'ratio', range: { min: 0, max: 1 }, headline: true }],
  aggregation: 'equal-mean-of-conditions',
  evaluator: { package: 'visin-fusion', minVersion: '1.0.0' },
  ...overrides
});
/** What a faithful evaluator of `proto` observed. */
const evidenceFor = (proto: Record<string, unknown> = protocol(), overrides: Record<string, unknown> = {}) => ({
  data: { kind: 'external', manifestSha256: 'a'.repeat(64) },
  protocolDigest: protocolDigest(suiteProtocolSchema.parse(proto)),
  evaluator: { package: (proto.evaluator as { package: string }).package, version: '1.4.2' },
  ...overrides
});
const results = (day: number, night: number) => ({ day: { overall: { m: day } }, night: { overall: { m: night } } });
const counts = { day: 10, night: 5 };

describe('publishing and the public leaderboards, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'public-leaderboards-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([Suite.init(), Evaluation.init()]);
    const app = express();
    // Each test is its own client, so the per-address limit of the public routes is not shared between them.
    app.set('trust proxy', true);
    app.use(express.json({ limit: '5mb' }), identityContextMiddleware);
    app.use('/suites', suiteRoutes);
    app.use('/evaluations', evaluationRoutes);
    app.use('/projects', projectRoutes);
    app.use('/public', publicRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  let client = 0;
  beforeEach(async () => {
    client += 1;
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
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.1.${Math.floor(client / 250)}.${client % 250}`, ...(user ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: (() => { try { return text ? JSON.parse(text) : {}; } catch { return {}; } })() as Body, text };
  };
  /** the project most recently created: a badge names the project whose row it shows */
  let lastProject = '';
  const project = (fields: Record<string, unknown> = {}) =>
    Project.create({ name: 'Road team', slug: `road-${new mongoose.Types.ObjectId()}`, owner: { kind: 'group', id: GROUP }, createdBy: OWNER, visibility: 'public', ...fields }).then(created => {
      lastProject = String(created._id);
      return lastProject;
    });
  const publishSuite = (projectId: string, overrides: Record<string, unknown> = {}, proto = protocol()) =>
    call('/suites', { method: 'POST', body: { slug: 'road-test', version: 1, name: 'Road test', projectId, visibility: 'public', protocol: proto, ...overrides } });
  const record = async (projectId: string, name: string, day: number, night: number, extra: Record<string, unknown> = {}) =>
    (await call('/evaluations', { method: 'POST', body: { projectId, uuid: `${name}-${day}-${night}`, suite: 'road-test@1', checkpoint: local(name), results: results(day, night), sampleCounts: counts, evidence: evidenceFor(), ...extra } })).body.data._id as string;
  const publish = (id: string, user = OWNER) => call(`/evaluations/${id}/publish`, { method: 'POST', user });
  const withdraw = (id: string, user = OWNER) => call(`/evaluations/${id}/withdraw`, { method: 'POST', user });
  const board = (user = ANONYMOUS, version = 1) => call(`/public/leaderboards/road-test/${version}`, { user });
  const entries = async (user = ANONYMOUS) => ((await board(user)).body.data?.entries ?? []) as { rank: number; checkpoint: { label: string } }[];

  describe('publishing', () => {
    it('needs manage on the project, and shows a stranger only that it is not found', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      expect((await publish(evaluation, MEMBER)).status).toBe(403);
      expect((await publish(evaluation, STRANGER)).body.message).toBeTruthy();
      expect((await publish(evaluation, ANONYMOUS)).status).toBe(401);
      expect((await withdraw(evaluation, MEMBER)).status).toBe(403);
      expect((await publish('000000000000000000000fff')).status).toBe(404);
      expect((await publish('nope')).status).toBe(404);
      expect((await board()).body.data.entries).toEqual([]);
      const done = await publish(evaluation, ADMIN);
      expect(done.status).toBe(200);
      expect(done.body.data.publishedAt).toBeTruthy();
    });

    it('publishes only a ranked result, from a public project, on a public suite', async () => {
      const open = await project();
      const hidden = await project({ visibility: 'private' });
      await publishSuite(open);
      const exploratory = (await call('/evaluations', { method: 'POST', body: { projectId: open, results: {} } })).body.data._id;
      const incomplete = await record(open, 'B', 0.5, 0.5, { results: { day: { overall: { m: 0.5 } } }, sampleCounts: { day: 10 } });
      const failed = await record(open, 'C', 0, 0, { status: 'failed', results: {} });
      for (const id of [exploratory, incomplete, failed]) {
        const refused = await publish(id);
        expect(refused.status).toBe(409);
        expect(refused.body.message).toContain('ranked');
      }

      const inPrivate = await record(hidden, 'A', 0.8, 0.6);
      const refusedPrivate = await publish(inPrivate);
      expect(refusedPrivate.status).toBe(409);
      expect(refusedPrivate.body.message).toContain('public project');

      await publishSuite(open, { slug: 'closed', visibility: 'private' });
      const onPrivateSuite = (await call('/evaluations', { method: 'POST', body: { projectId: open, suite: 'closed@1', checkpoint: local('A'), results: results(0.8, 0.6), sampleCounts: counts, evidence: evidenceFor() } })).body.data._id;
      const refusedSuite = await publish(onPrivateSuite);
      expect(refusedSuite.status).toBe(409);
      expect(refusedSuite.body.message).toContain('not public');
      expect(await Evaluation.countDocuments({ publishedAt: { $ne: null } })).toBe(0);
    });

    it('is idempotent both ways, and recorded for the project\'s history', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      const first = await publish(evaluation);
      const again = await publish(evaluation);
      expect(again.body.data.publishedAt).toBe(first.body.data.publishedAt);
      expect((await withdraw(evaluation)).body.data.publishedAt).toBeUndefined();
      expect((await withdraw(evaluation)).status).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 50));
      const events = await mongoose.connection.collection('resource_events').find({ resourceType: 'evaluation' }).toArray();
      expect(events.map(event => event.visibility)).toEqual(['public', 'private']);
      expect(events[0]).toMatchObject({ action: 'visibility', actorId: OWNER, resourceId: evaluation });
    });

    it('does not publish a trashed result, and a trashed one disappears from the public views', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      expect(await entries()).toHaveLength(1);
      await call(`/evaluations/${evaluation}`, { method: 'DELETE' });
      expect(await entries()).toEqual([]);
      expect((await publish(evaluation)).status).toBe(404);
    });
  });

  describe('the terms of the evaluated data', () => {
    it('are shown beside the board, as the publisher wrote them, and only while the suite is public', async () => {
      const id = await project();
      await publishSuite(id, {
        dataTerms: { license: { id: 'cc-by-4.0' }, sourceUrl: 'https://data.example.test/roads', credit: 'Road Lab, 2025' }
      });
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      const shown = (await board()).body.data.suite.dataTerms;
      expect(shown).toEqual({
        license: { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', commercial: true },
        sourceUrl: 'https://data.example.test/roads',
        credit: 'Road Lab, 2025'
      });
      expect((await call('/public/leaderboards', { user: ANONYMOUS })).body.data.leaderboards[0].dataTerms).toEqual(shown);
      expect((await call(`/public/evaluations/${evaluation}`, { user: ANONYMOUS })).body.data.suite.dataTerms).toEqual(shown);
    });

    it('are absent when nothing was declared, rather than guessed', async () => {
      const id = await project();
      await publishSuite(id);
      await publish(await record(id, 'A', 0.8, 0.6));
      expect((await board()).body.data.suite).not.toHaveProperty('dataTerms');
    });
  });

  describe('badges', () => {
    const keyOf = (name: string) => `sha256:${sha(name)}`;
    const badge = (key: string, version = 1, slug = 'road-test', projectRef = lastProject) =>
      call(`/public/badges/${slug}/${version}/${encodeURIComponent(key)}.svg?project=${projectRef}`, { user: ANONYMOUS });

    it('is an SVG with the suite, the score and the rank among the published checkpoints', async () => {
      const id = await project();
      await publishSuite(id);
      await publish(await record(id, 'A', 0.9, 0.9));
      await publish(await record(id, 'B', 0.5, 0.5));

      const response = await badge(keyOf('B'));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/svg+xml');
      expect(response.headers.get('cache-control')).toBe('public, max-age=60');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(response.text).toContain('<svg');
      expect(response.text).toContain('road-test v1');
      expect(response.text).toContain('m 0.5 · rank 2/2');
      expect((await badge(keyOf('A'))).text).toContain('m 0.9 · rank 1/2');
    });

    it('names a Hub checkpoint by its encoded canonical key', async () => {
      const id = await project({ storage: { provider: 'hf' } });
      await publishSuite(id);
      const hub = { kind: 'hf', repo: 'Acme/Clft', commit: COMMIT, path: 'best.safetensors' };
      await publish(await record(id, 'unused', 0.8, 0.6, { checkpoint: hub }));
      const key = `hf:acme/clft@${COMMIT}:best.safetensors`;
      expect((await badge(key)).status).toBe(200);
      expect((await badge(`hf:acme/clft@${COMMIT}:`)).status).toBe(404);
    });

    it('is the same 404 for everything that is not published there, so it reveals nothing', async () => {
      const id = await project();
      await publishSuite(id);
      await publishSuite(id, { slug: 'closed', visibility: 'private' });
      const unpublished = await record(id, 'unpublished', 0.8, 0.6);
      const withdrawn = await record(id, 'withdrawn', 0.7, 0.6);
      await publish(withdrawn);
      await withdraw(withdrawn);
      await publish(await record(id, 'live', 0.9, 0.9));
      expect(unpublished).toBeTruthy();

      const missing = await badge(keyOf('never-recorded'));
      expect(missing.status).toBe(404);
      for (const response of [await badge(keyOf('unpublished')), await badge(keyOf('withdrawn')), await badge(keyOf('live'), 2), await badge(keyOf('live'), 1, 'closed'), await badge(keyOf('live'), 1, 'nope')]) {
        expect(response.status).toBe(404);
        expect(response.body.message).toBe(missing.body.message);
        expect(response.text).not.toContain('<svg');
      }
      expect((await badge(keyOf('live'))).status).toBe(200);
    });

    it('goes when the result is withdrawn or its project turns private, at once', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      expect((await badge(keyOf('A'))).status).toBe(200);
      await Project.updateOne({ _id: id }, { visibility: 'private' });
      expect((await badge(keyOf('A'))).status).toBe(404);
      await Project.updateOne({ _id: id }, { visibility: 'public' });
      expect((await badge(keyOf('A'))).status).toBe(200);
      await withdraw(evaluation);
      expect((await badge(keyOf('A'))).status).toBe(404);
    });

    it('draws only escaped text, whatever a suite names its headline', async () => {
      const id = await project();
      await publishSuite(id, {}, protocol({ metrics: [{ key: 'm"><script>x</script>', direction: 'max', range: { min: 0, max: 1 }, headline: true }] }));
      const body = { projectId: id, suite: 'road-test@1', checkpoint: local('X'), sampleCounts: counts, results: { day: { overall: { 'm"><script>x</script>': 0.5 } }, night: { overall: { 'm"><script>x</script>': 0.5 } } }, evidence: evidenceFor(protocol({ metrics: [{ key: 'm"><script>x</script>', direction: 'max', range: { min: 0, max: 1 }, headline: true }] })) };
      const created = await call('/evaluations', { method: 'POST', body });
      expect(created.status).toBe(201);
      await publish(created.body.data._id);
      const response = await badge(keyOf('X'));
      expect(response.status).toBe(200);
      expect(response.text).not.toContain('<script>');
      expect(response.text).toContain('&lt;script&gt;');
    });
  });

  describe('a result judged before evidence levels existed', () => {
    it('is ranked and shown with no level, and still has its badge', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'Old', 0.8, 0.6);
      await publish(evaluation);
      await Evaluation.updateOne({ _id: evaluation }, { $unset: { 'validation.evidence': '' } });

      const entry = (await entries())[0] as unknown as { evidenceLevel: string };
      expect(entry.evidenceLevel).toBe('none');
      expect((await call(`/public/evaluations/${evaluation}`, { user: ANONYMOUS })).body.data.evidenceLevel).toBe('none');
      expect((await call(`/public/badges/road-test/1/${encodeURIComponent(`sha256:${sha('Old')}`)}.svg?project=${id}`, { user: ANONYMOUS })).status).toBe(200);
    });
  });

  describe('a checkpoint published to two suites', () => {
    it('has a badge for each, and only the one asked for', async () => {
      const id = await project();
      await publishSuite(id);
      await publishSuite(id, { slug: 'depth-test' });
      const first = await record(id, 'A', 0.8, 0.6);
      const second = (await call('/evaluations', { method: 'POST', body: { projectId: id, suite: 'depth-test@1', checkpoint: local('A'), results: results(0.4, 0.4), sampleCounts: counts, evidence: evidenceFor() } })).body.data._id;
      await publish(first);
      await publish(second);
      const key = encodeURIComponent(`sha256:${sha('A')}`);
      const one = await call(`/public/badges/road-test/1/${key}.svg?project=${id}`, { user: ANONYMOUS });
      const other = await call(`/public/badges/depth-test/1/${key}.svg?project=${id}`, { user: ANONYMOUS });
      expect(one.text).toContain('road-test v1');
      expect(one.text).not.toContain('depth-test');
      expect(other.text).toContain('depth-test v1');
      expect(other.text).toContain('m 0.4 · rank 1/1');
    });
  });

  describe('one row per checkpoint and project, chosen before anything is hidden', () => {
    it('shows no row, and refuses to publish the older attempt, once a newer ranked attempt exists', async () => {
      const id = await project();
      await publishSuite(id);
      const best = await record(id, 'A', 0.9, 0.9);
      await new Promise(resolve => setTimeout(resolve, 5));
      const worse = await record(id, 'A', 0.5, 0.5);
      const refused = await publish(best);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toContain('newer');
      expect(await entries()).toEqual([]);
      expect((await publish(worse)).status).toBe(200);
      const rows = (await board()).body.data.entries;
      expect(rows).toMatchObject([{ evaluationId: worse, attempts: 2 }]);
      expect(rows[0].headline).toBeCloseTo(0.5);
    });

    it('takes a published row off the board when a newer ranked attempt arrives, until that one is published', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, 'A', 0.9, 0.9);
      await publish(first);
      expect(await entries()).toHaveLength(1);
      await new Promise(resolve => setTimeout(resolve, 5));
      const second = await record(id, 'A', 0.6, 0.6);
      expect(await entries()).toEqual([]);
      expect((await call(`/public/evaluations/${first}`, { user: ANONYMOUS })).status).toBe(404);
      expect((await Evaluation.findById(first))!.publishedAt).toBeUndefined();
      await publish(second);
      expect((await board()).body.data.entries).toMatchObject([{ evaluationId: second, attempts: 2 }]);
    });

    it('keeps a newer attempt that cannot be ranked from displacing the published one', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, 'A', 0.9, 0.9);
      await publish(first);
      await record(id, 'A', 0.9, 0.9, { uuid: 'half', results: { day: { overall: { m: 0.1 } } }, sampleCounts: { day: 10 } });
      expect((await board()).body.data.entries).toMatchObject([{ evaluationId: first, attempts: 2 }]);
    });

    it('does not let another project replace a published row', async () => {
      const mine = await project({ name: 'Mine' });
      const theirs = await project({ name: 'Theirs' });
      await publishSuite(mine);
      const first = await record(mine, 'A', 0.9, 0.9);
      await publish(first);
      await new Promise(resolve => setTimeout(resolve, 5));
      const rival = await record(theirs, 'A', 0.2, 0.2, { uuid: 'rival' });
      const stolen = await publish(rival);
      expect(stolen.status).toBe(200);
      const rows = (await board()).body.data.entries as { evaluationId: string; rank: number; project: { name: string } }[];
      expect(rows.map(row => [row.rank, row.evaluationId, row.project.name])).toEqual([[1, first, 'Mine'], [2, rival, 'Theirs']]);
    });

    it('draws a badge for the project it names, and for no other', async () => {
      const mine = await project({ name: 'Mine' });
      const theirs = await project({ name: 'Theirs' });
      await publishSuite(mine);
      await publish(await record(mine, 'A', 0.9, 0.9));
      await publish(await record(theirs, 'A', 0.2, 0.2, { uuid: 'rival' }));
      const key = `sha256:${sha('A')}`;
      const at = (projectRef: string) => call(`/public/badges/road-test/1/${encodeURIComponent(key)}.svg?project=${projectRef}`, { user: ANONYMOUS });
      expect((await at(mine)).text).toContain('m 0.9 · rank 1/2');
      expect((await at(theirs)).text).toContain('m 0.2 · rank 2/2');
      expect((await at('nobody')).status).toBe(404);
      expect((await call(`/public/badges/road-test/1/${encodeURIComponent(key)}.svg`, { user: ANONYMOUS })).status).toBe(400);
    });
  });

  describe('who may publish to a suite, and what its managers decide', () => {
    /** A public project of someone else's (managed by STRANGER), publishing to a suite the main project owns. */
    const foreign = () => project({ name: 'Visitors', owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
    const recordAs = (projectId: string, name: string, day: number, night: number, user = STRANGER) =>
      call('/evaluations', { method: 'POST', user, body: { projectId, uuid: `${name}-${day}`, suite: 'road-test@1', checkpoint: local(name), results: results(day, night), sampleCounts: counts, evidence: evidenceFor() } })
        .then(response => response.body.data._id as string);
    const submissions = (user = OWNER) => call('/suites/road-test/1/submissions', { user });
    const names = async () => (await entries()).map(entry => entry.checkpoint.label);

    it('lets a suite that takes its own project\'s results only refuse everyone else, and not its owner', async () => {
      const home = await project();
      const away = await foreign();
      await publishSuite(home, { submissions: 'members' });
      const mine = await record(home, 'Mine', 0.9, 0.9);
      const theirs = await recordAs(away, 'Theirs', 0.8, 0.8);
      expect((await publish(mine)).status).toBe(200);
      const refused = await publish(theirs, STRANGER);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toContain('only takes results from its own project');
      expect(await names()).toEqual(['Mine']);
    });

    it('shows unverified results and uses suite review to set the same verification fields', async () => {
      const home = await project();
      const away = await foreign();
      await publishSuite(home, { submissions: 'approval' });
      const mine = await record(home, 'Mine', 0.9, 0.9);
      const theirs = await recordAs(away, 'Theirs', 0.8, 0.8);
      await publish(mine);
      const submitted = await publish(theirs, STRANGER);
      expect(submitted.status).toBe(200);
      expect(submitted.body.data.verifiedAt).toBeUndefined();
      // Verification is a label, not a visibility gate.
      expect(await names()).toEqual(['Mine', 'Theirs']);
      expect((await call(`/public/evaluations/${theirs}`, { user: ANONYMOUS })).status).toBe(200);
      expect((await call(`/public/badges/road-test/1/${encodeURIComponent(`sha256:${sha('Theirs')}`)}.svg?project=${away}`, { user: ANONYMOUS })).status).toBe(200);

      const queue = (await submissions()).body.data;
      expect(queue.suite).toEqual({ slug: 'road-test', version: 1, submissions: 'approval' });
      expect(queue.pending).toEqual(expect.arrayContaining([expect.objectContaining({ evaluationId: theirs, project: expect.objectContaining({ name: 'Visitors' }), checkpoint: expect.objectContaining({ kind: 'local', label: 'Theirs' }), headline: expect.objectContaining({ key: 'm' }) })]));
      expect(queue.hidden).toEqual([]);

      expect((await call(`/evaluations/${theirs}/approve`, { method: 'POST', user: MEMBER })).status).toBe(403);
      expect((await call(`/evaluations/${theirs}/approve`, { method: 'POST', user: STRANGER })).status).toBe(403);
      expect((await submissions(MEMBER)).status).toBe(403);
      expect((await call(`/evaluations/${theirs}/approve`, { method: 'POST', user: ANONYMOUS })).status).toBe(401);
      expect((await call(`/evaluations/${theirs}/approve`, { method: 'POST', user: ADMIN })).status).toBe(200);
      expect(await names()).toEqual(['Mine', 'Theirs']);
      expect((await submissions()).body.data.pending).toHaveLength(1);
      expect((await call(`/evaluations/${theirs}/approve`, { method: 'POST', user: ADMIN })).status).toBe(200);
      expect((await call(`/evaluations/${mine}/approve`, { method: 'POST', user: ADMIN })).status).toBe(200);
      const unpublished = await recordAs(away, 'Unpublished', 0.7, 0.7);
      expect((await call(`/evaluations/${unpublished}/approve`, { method: 'POST', user: ADMIN })).status).toBe(409);
    });

    it('shows the suite\'s own project\'s result at once, even where others need approval', async () => {
      const home = await project();
      await publishSuite(home, { submissions: 'approval' });
      await publish(await record(home, 'Mine', 0.9, 0.9));
      expect(await names()).toEqual(['Mine']);
      expect((await submissions()).body.data.pending).toHaveLength(1);
    });

    it('requires an actor and refuses moderation with a credential scoped to another project', async () => {
      const home = await project();
      await publishSuite(home);
      const mine = await record(home, 'Mine', 0.9, 0.9);
      await expect(approveEvaluation(mine, undefined)).rejects.toThrow('Authentication required');
      await expect(hideEvaluation(mine, undefined, 'reason')).rejects.toThrow('Authentication required');
      await expect(unhideEvaluation(mine, undefined)).rejects.toThrow('Authentication required');
      await expect(listSubmissions('road-test', 1, undefined)).rejects.toThrow('Authentication required');
      await projectTokenContext.run({ projectId: 'another-project', userId: OWNER }, async () => {
        await expect(listSubmissions('road-test', 1, OWNER)).rejects.toThrow('cannot moderate another project');
      });
    });

    it('keeps an approved submission hidden until a manager unhides it', async () => {
      const home = await project();
      const away = await foreign();
      await publishSuite(home, { submissions: 'approval' });
      const theirs = await recordAs(away, 'Theirs', 0.8, 0.8);
      expect((await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: ADMIN, body: { reason: 'check' } })).status).toBe(409);
      await publish(theirs, STRANGER);
      await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: ADMIN, body: { reason: 'check' } });
      await call(`/evaluations/${theirs}/approve`, { method: 'POST', user: ADMIN });
      expect(await names()).toEqual([]);
      expect((await submissions()).body.data.hidden).toMatchObject([{ evaluationId: theirs }]);
      await call(`/evaluations/${theirs}/unhide`, { method: 'POST', user: ADMIN });
      expect(await names()).toEqual(['Theirs']);
    });

    it('lets a manager of the suite hide any published result with a reason, and show it again', async () => {
      const home = await project();
      const away = await foreign();
      await publishSuite(home);
      const theirs = await recordAs(away, 'Theirs', 0.99, 0.99);
      await publish(theirs, STRANGER);
      expect(await names()).toEqual(['Theirs']);
      const events = () => mongoose.connection.collection('resource_events').countDocuments({ resourceType: 'evaluation' });
      const before = await events();

      expect((await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: OWNER, body: {} })).status).toBe(400);
      expect((await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: MEMBER, body: { reason: 'x' } })).status).toBe(403);
      expect((await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: STRANGER, body: { reason: 'x' } })).status).toBe(403);
      const hidden = await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: ADMIN, body: { reason: 'Scores do not match the paper' } });
      expect(hidden.status).toBe(200);
      expect(await names()).toEqual([]);
      expect((await call(`/public/evaluations/${theirs}`, { user: ANONYMOUS })).status).toBe(404);
      expect((await submissions()).body.data.hidden).toMatchObject([{ evaluationId: theirs, hidden: { reason: 'Scores do not match the paper' } }]);
      expect(await events()).toBe(before + 1);
      // Its submitter sees it as hidden, cannot publish it again, and can still withdraw it.
      expect((await call(`/evaluations/${theirs}`, { user: STRANGER })).body.data.hidden).toMatchObject({ reason: 'Scores do not match the paper' });
      expect((await publish(theirs, STRANGER)).status).toBe(409);
      expect((await withdraw(theirs, STRANGER)).status).toBe(200);
      expect((await publish(theirs, STRANGER)).status).toBe(409);
      expect((await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: ADMIN, body: { reason: 'again' } })).status).toBe(409);
      expect((await submissions()).body.data.hidden).toEqual([]);

      expect((await call(`/evaluations/${theirs}/unhide`, { method: 'POST', user: ADMIN })).status).toBe(200);
      expect((await call(`/evaluations/${theirs}/unhide`, { method: 'POST', user: ADMIN })).body.data).toEqual({ hidden: false });
      expect((await publish(theirs, STRANGER)).status).toBe(200);
      expect(await names()).toEqual(['Theirs']);
      expect((await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: ADMIN, body: { reason: 'second thoughts' } })).status).toBe(200);
      expect((await call(`/evaluations/${theirs}/hide`, { method: 'POST', user: ADMIN, body: { reason: 'second thoughts' } })).status).toBe(200);
    });

    it('is not found for a result on a suite the caller cannot read, so none is confirmed', async () => {
      const home = await project({ visibility: 'private' });
      await publishSuite(home, { visibility: 'private' });
      const mine = await record(home, 'Mine', 0.9, 0.9);
      expect((await call(`/evaluations/${mine}/hide`, { method: 'POST', user: STRANGER, body: { reason: 'x' } })).status).toBe(404);
      expect((await call('/evaluations/nope/hide', { method: 'POST', body: { reason: 'x' } })).status).toBe(404);
      expect((await call('/suites/nope/1/submissions')).status).toBe(404);
      expect((await call('/suites/road-test/1/submissions', { user: STRANGER })).status).toBe(404);
    });

    it('changes the policy only for a manager, and leaves what is published as it is', async () => {
      const home = await project();
      const away = await foreign();
      await publishSuite(home);
      const theirs = await recordAs(away, 'Theirs', 0.8, 0.8);
      await publish(theirs, STRANGER);
      expect((await call('/suites/road-test/1', { method: 'PATCH', user: MEMBER, body: { submissions: 'members' } })).status).toBe(403);
      const changed = await call('/suites/road-test/1', { method: 'PATCH', user: ADMIN, body: { submissions: 'members' } });
      expect(changed.body.data.submissions).toBe('members');
      expect(await names()).toEqual(['Theirs']);
      expect((await call('/suites/road-test/2', { method: 'GET' })).status).toBe(404);
      const next = await publishSuite(home, { version: 2 });
      expect(next.body.data.submissions).toBe('members');
    });
  });

  describe('going private ends publication for good', () => {
    it('does not bring results back when the project is made public again', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      expect(await entries()).toHaveLength(1);
      expect((await call(`/projects/${id}`, { method: 'PUT', body: { visibility: 'private' } })).status).toBe(200);
      expect((await Evaluation.findById(evaluation))!.publishedAt).toBeUndefined();
      expect((await call(`/projects/${id}`, { method: 'PUT', body: { visibility: 'public' } })).status).toBe(200);
      expect(await entries()).toEqual([]);
      expect((await publish(evaluation)).status).toBe(200);
      expect(await entries()).toHaveLength(1);
    });

    it('does not bring results back when the project comes out of the trash', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      expect((await call(`/projects/${id}`, { method: 'DELETE' })).status).toBe(200);
      expect((await Evaluation.findById(evaluation))!.publishedAt).toBeUndefined();
      expect((await call(`/projects/${id}/restore`, { method: 'POST' })).status).toBe(200);
      expect(await entries()).toEqual([]);
    });

    it('does not bring results back when the suite is made public again', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      expect((await call('/suites/road-test/1', { method: 'PATCH', body: { visibility: 'private' } })).status).toBe(200);
      expect((await Evaluation.findById(evaluation))!.publishedAt).toBeUndefined();
      expect((await call('/suites/road-test/1', { method: 'PATCH', body: { visibility: 'public' } })).status).toBe(200);
      expect(await entries()).toEqual([]);
      expect((await publish(evaluation)).status).toBe(200);
      expect(await entries()).toHaveLength(1);
    });
  });

  describe('what the server remembers of the public views', () => {
    const previous = process.env.NODE_ENV;
    const names = async () => (await entries()).map(entry => entry.checkpoint.label);
    beforeEach(() => { invalidatePublic(); process.env.NODE_ENV = 'production'; });
    afterEach(() => { invalidatePublic(); if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });

    it('serves a board from memory, and forgets it at once when a result is published, withdrawn or moderated', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, 'A', 0.8, 0.6);
      const second = await record(id, 'B', 0.5, 0.5);
      await publish(first);
      expect(await names()).toEqual(['A']);
      // A change made behind the service's back is not seen while the answer is remembered...
      await Evaluation.updateOne({ _id: first }, { $unset: { publishedAt: 1 } });
      expect(await names()).toEqual(['A']);
      // ...but anything the service does is: publish, withdraw, hide.
      expect((await publish(second)).status).toBe(200);
      expect(await names()).toEqual(['B']);
      expect((await withdraw(second)).status).toBe(200);
      expect(await names()).toEqual([]);
      expect((await publish(first)).status).toBe(200);
      expect(await names()).toEqual(['A']);
      expect((await call(`/evaluations/${first}/hide`, { method: 'POST', body: { reason: 'test' } })).status).toBe(200);
      expect(await names()).toEqual([]);
      expect((await call(`/evaluations/${first}/unhide`, { method: 'POST' })).status).toBe(200);
      expect(await names()).toEqual(['A']);
    });

    it('forgets a project turning private, a suite going private and a result being trashed', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, 'A', 0.8, 0.6);
      await publish(first);
      expect(await entries()).toHaveLength(1);
      await call(`/evaluations/${first}`, { method: 'DELETE' });
      expect(await entries()).toEqual([]);
      await call(`/evaluations/${first}/restore`, { method: 'POST' });
      await publish(first);
      expect(await entries()).toHaveLength(1);
      await call(`/projects/${id}`, { method: 'PUT', body: { visibility: 'private' } });
      expect(await entries()).toEqual([]);
    });

    it('does not remember a refusal', async () => {
      expect((await board()).status).toBe(404);
      const id = await project();
      await publishSuite(id);
      await publish(await record(id, 'A', 0.8, 0.6));
      expect((await board()).status).toBe(200);
    });
  });

  describe('trash and restore', () => {
    it('takes a published result down for good: restoring it does not publish it again', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      expect(await entries()).toHaveLength(1);

      await call(`/evaluations/${evaluation}`, { method: 'DELETE' });
      expect((await Evaluation.findById(evaluation))?.publishedAt).toBeUndefined();
      const logged = await mongoose.connection.collection('resource_events').find({ resourceType: 'evaluation', resourceId: evaluation }).toArray();
      expect(logged.map(event => event.visibility)).toEqual(['public', 'private']);
      await call(`/evaluations/${evaluation}/restore`, { method: 'POST' });
      expect(await entries()).toEqual([]);
      expect((await call(`/public/evaluations/${evaluation}`, { user: ANONYMOUS })).status).toBe(404);

      expect((await publish(evaluation)).status).toBe(200);
      expect(await entries()).toHaveLength(1);
    });

    it('does not record a withdrawal for a result that was never published', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      const recorded = () => mongoose.connection.collection('resource_events').countDocuments({ resourceType: 'evaluation' });
      const before = await recorded();
      await call(`/evaluations/${evaluation}`, { method: 'DELETE' });
      expect(await recorded()).toBe(before);
    });
  });

  describe('the public leaderboard', () => {
    it('selects across more than 5,000 published attempts, preserves global ranks on pages and resolves older evidence directly', async () => {
      const id = await project();
      const hidden = await project({ visibility: 'private' });
      await publishSuite(id);
      const old = await record(id, 'A', 0.9, 0.9);
      await publish(old);
      const seed = (await Evaluation.findById(old).lean())!;
      // Hidden rows would crowd out the public pool if permission filtering followed the old cap.
      await Evaluation.collection.insertMany(
        Array.from({ length: 5001 }, (_, index) => ({
          ...seed,
          _id: new mongoose.Types.ObjectId(),
          projectId: hidden,
          uuid: `hidden-${index}`
        }))
      );
      // The latest attempt falls beyond the old unsorted public pool, and is worse than its predecessor.
      const latest = new mongoose.Types.ObjectId();
      await Evaluation.collection.insertMany(
        Array.from({ length: 5001 }, (_, index) => ({
          ...seed,
          _id: index === 5000 ? latest : new mongoose.Types.ObjectId(),
          uuid: `repeat-${index}`,
          receivedAt: new Date(seed.receivedAt.getTime() + index + 1),
          publishedAt: new Date(seed.publishedAt!.getTime() + index + 1),
          validation: {
            ...seed.validation,
            scores: { overall: { m: 0.4 }, conditions: { day: { m: 0.4 }, night: { m: 0.4 } } }
          }
        }))
      );
      await publish(await record(id, 'B', 0.7, 0.7));
      const first = (await call('/public/leaderboards/road-test/1?limit=1', { user: ANONYMOUS })).body.data;
      expect(first.scope).toEqual({ candidates: 5003 });
      expect(first.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
      expect(first.entries).toMatchObject([{ rank: 1, checkpoint: { label: 'B' } }]);
      const second = (await call('/public/leaderboards/road-test/1?limit=1&page=2', { user: ANONYMOUS })).body.data;
      expect(second.entries).toMatchObject([
        { rank: 2, evaluationId: latest.toString(), headline: 0.4, attempts: 5002 }
      ]);
      expect((await call(`/public/evaluations/${latest}`, { user: ANONYMOUS })).status).toBe(200);
      // The board shows a checkpoint by its latest result, so an earlier one is no longer a public page.
      expect((await call(`/public/evaluations/${old}`, { user: ANONYMOUS })).status).toBe(404);
      const list = (await call('/public/leaderboards?limit=1', { user: ANONYMOUS })).body.data;
      expect(list.leaderboards).toMatchObject([
        { checkpoints: 2, lastPublishedAt: new Date(seed.publishedAt!.getTime() + 5001).toISOString() }
      ]);
      expect(list.pagination).toEqual({ page: 1, limit: 1, total: 1, pages: 1 });
      expect(
        (await call('/public/leaderboards/road-test/1?limit=1&page=3', { user: ANONYMOUS })).body.data.entries
      ).toEqual([]);
    });

    it.each(['page=0', 'page=1.5', 'page=9007199254740992', 'limit=101', 'limit=-1'])(
      'rejects invalid public pagination: %s',
      async (query) => {
        expect((await call(`/public/leaderboards?${query}`, { user: ANONYMOUS })).status).toBe(400);
        expect((await call(`/public/leaderboards/road-test/1?${query}`, { user: ANONYMOUS })).status).toBe(400);
      }
    );

    it('ranks only what was published, so private attempts never change a public rank', async () => {
      const id = await project();
      await publishSuite(id);
      const best = await record(id, 'Best', 0.9, 0.9);
      const middle = await record(id, 'Middle', 0.7, 0.7);
      await record(id, 'Worst', 0.5, 0.5);
      await publish(middle);
      expect((await board()).body.data).toMatchObject({ scope: { candidates: 1 }, entries: [{ rank: 1, checkpoint: { label: 'Middle' } }] });
      await publish(best);
      const data = (await board()).body.data;
      expect(data.entries.map((entry: { rank: number; checkpoint: { label: string } }) => [entry.rank, entry.checkpoint.label])).toEqual([[1, 'Best'], [2, 'Middle']]);
      expect(data.scope).toEqual({ candidates: 2 });
      expect(data.selection).toBe('latest-eligible-completed');
      expect(data.evidence).toBe('submitter-reported');
      expect(data.generatedAt).toBeTruthy();
    });

    it('gives a signed-in owner exactly what a stranger gets, even when the request carries a credential', async () => {
      const id = await project();
      await publishSuite(id);
      await publish(await record(id, 'A', 0.8, 0.6));
      await record(id, 'Private', 0.99, 0.99);
      const strip = (text: string) => JSON.parse(text, (key, value) => (key === 'generatedAt' ? undefined : value));
      const anonymous = strip((await board(ANONYMOUS)).text);
      expect(strip((await board(OWNER)).text)).toEqual(anonymous);
      expect(strip((await board(STRANGER)).text)).toEqual(anonymous);
      const list = (await call('/public/leaderboards', { user: ANONYMOUS })).body.data;
      expect((await call('/public/leaderboards', { user: OWNER })).body.data).toEqual(list);
      expect(anonymous.data.entries).toHaveLength(1);
    });

    it('shows the summary a visitor needs: headline, worst condition, gap, per-condition scores and attribution', async () => {
      const id = await project({ name: 'Road team' });
      await publishSuite(id);
      await publish(await record(id, 'A', 0.8, 0.6));
      const { entries: [entry], suite } = (await board()).body.data;
      expect(entry).toMatchObject({ rank: 1, attempts: 1, worst: { condition: 'night' }, conditions: { day: 0.8, night: 0.6 }, project: { name: 'Road team' } });
      expect(entry.headline).toBeCloseTo(0.7);
      expect(entry.worst.value).toBeCloseTo(0.6);
      expect(entry.gap).toBeCloseTo(0.1);
      expect(suite).toMatchObject({
        slug: 'road-test', version: 1, name: 'Road test', task: 'segmentation', split: 'test', aggregation: 'equal-mean-of-conditions',
        headline: { key: 'm', direction: 'max', unit: 'ratio' }, conditions: [{ name: 'day', sampleCount: 10 }, { name: 'night', sampleCount: 5 }],
        data: { kind: 'external', label: 'Road frames' }, evaluator: { package: 'visin-fusion', minVersion: '1.0.0' }
      });
    });

    it('lists the leaderboards that have something published, newest first, and no others', async () => {
      const id = await project();
      expect((await call('/public/leaderboards', { user: ANONYMOUS })).body.data.leaderboards).toEqual([]);
      await publishSuite(id);
      await publishSuite(id, { slug: 'depth-test' });
      await publishSuite(id, { slug: 'empty-test' });
      const a = await record(id, 'A', 0.8, 0.6);
      const b = await record(id, 'B', 0.7, 0.7);
      const depth = (await call('/evaluations', { method: 'POST', body: { projectId: id, suite: 'depth-test@1', checkpoint: local('A'), results: results(0.5, 0.5), sampleCounts: counts, evidence: evidenceFor() } })).body.data._id;
      await publish(a);
      await publish(b);
      await publish(depth);
      const { leaderboards } = (await call('/public/leaderboards', { user: ANONYMOUS })).body.data;
      expect(leaderboards.map((item: { slug: string; checkpoints: number }) => [item.slug, item.checkpoints])).toEqual([['depth-test', 1], ['road-test', 2]]);
      expect(leaderboards[0]).toMatchObject({ headline: { key: 'm' }, task: 'segmentation' });
      expect(leaderboards[0].lastPublishedAt).toBeTruthy();
      const second = (await call('/public/leaderboards?limit=1&page=2', { user: ANONYMOUS })).body.data;
      expect(second.leaderboards.map((item: { slug: string }) => item.slug)).toEqual(['road-test']);
      expect(second.pagination).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
    });

    it('lets a withdrawal, a privacy change or a trashed project remove a result from every public view at once', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      const everywhere = async () => [
        (await entries()).length,
        (await call('/public/leaderboards', { user: ANONYMOUS })).body.data.leaderboards.length,
        (await call(`/public/evaluations/${evaluation}`, { user: ANONYMOUS })).status
      ];
      expect(await everywhere()).toEqual([1, 1, 200]);

      await withdraw(evaluation);
      expect(await everywhere()).toEqual([0, 0, 404]);
      await publish(evaluation);
      expect(await everywhere()).toEqual([1, 1, 200]);

      await Project.updateOne({ _id: id }, { visibility: 'private' });
      expect(await everywhere()).toEqual([0, 0, 404]);
      await Project.updateOne({ _id: id }, { visibility: 'public' });
      expect(await everywhere()).toEqual([1, 1, 200]);

      await call('/suites/road-test/1', { method: 'PATCH', body: { visibility: 'private' } });
      expect(await everywhere()).toEqual([0, 0, 404]);
      expect((await board()).status).toBe(404);
      // Going private ended the publication: public again, it is not published until a manager does so afresh.
      await call('/suites/road-test/1', { method: 'PATCH', body: { visibility: 'public' } });
      expect(await everywhere()).toEqual([0, 0, 404]);
      await publish(evaluation);
      expect(await everywhere()).toEqual([1, 1, 200]);

      await Project.updateOne({ _id: id }, { trashedAt: new Date() });
      expect(await everywhere()).toEqual([0, 0, 404]);
    });

    it('still shows a published result on an archived suite, marked as archived', async () => {
      const id = await project();
      await publishSuite(id);
      await publish(await record(id, 'A', 0.8, 0.6));
      await call('/suites/road-test/1', { method: 'PATCH', body: { archived: true } });
      const data = (await board()).body.data;
      expect(data.entries).toHaveLength(1);
      expect(data.suite.archived).toBe(true);
    });

    it('keeps one row per checkpoint from its latest published ranked attempt, never the best', async () => {
      const id = await project();
      await publishSuite(id);
      const better = await record(id, 'A', 0.9, 0.9);
      await publish(better);
      await new Promise(resolve => setTimeout(resolve, 5));
      const later = await record(id, 'A', 0.6, 0.6);
      await publish(later);
      const { entries: rows } = (await board()).body.data;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ evaluationId: later, attempts: 2 });
      expect(rows[0].headline).toBeCloseTo(0.6);
    });

    it('answers 404 for a leaderboard that is private, absent or not a version, and 400 for a malformed address', async () => {
      const id = await project();
      await publishSuite(id, { visibility: 'private' });
      expect((await board()).status).toBe(404);
      expect((await board(ANONYMOUS, 7)).status).toBe(404);
      expect((await call('/public/leaderboards/Not%20A%20Slug/1', { user: ANONYMOUS })).status).toBe(400);
      expect((await call('/public/leaderboards/road-test/latest', { user: ANONYMOUS })).status).toBe(400);
      expect((await call('/public/evaluations/nope', { user: ANONYMOUS })).status).toBe(404);
    });
  });

  describe('what is exposed', () => {
    it('shows the evidence behind an entry, and the evaluator, and nothing the submitter did not mean to publish', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluation = await record(id, 'A', 0.8, 0.6, {
        provenance: {
          evaluator: { package: 'visin-fusion', version: '1.4.2', commit: '9d1c2ab', host: 'gpu-node-17' },
          command: 'python run.py --secret-flag',
          environment: { HOSTNAME: 'gpu-node-17', container: 'registry.internal/x' },
          config: { dataset_path: '/data/private/road' },
          seeds: [42]
        },
        source: undefined
      });
      await publish(evaluation);
      const detail = await call(`/public/evaluations/${evaluation}`, { user: ANONYMOUS });
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({
        evaluationId: evaluation, checkpoint: { kind: 'local', label: 'A' }, evidence: 'submitter-reported',
        evaluator: { package: 'visin-fusion', version: '1.4.2', commit: '9d1c2ab' }, sampleCounts: counts,
        scores: { conditions: { day: { m: 0.8 }, night: { m: 0.6 } } }, suite: { slug: 'road-test', version: 1 }
      });
      for (const leak of ['secret-flag', 'gpu-node-17', 'registry.internal', '/data/private', 'seeds', 'ownerId', 'projectId', 'uuid', 'contentHash', 'results', 'provenance', 'manifestSha256', 'protocolDigest', 'claims', OWNER]) {
        expect(detail.text).not.toContain(leak);
      }
      const listing = (await board()).text;
      for (const leak of ['secret-flag', 'gpu-node-17', '/data/private', 'ownerId', 'projectId', 'contentHash', 'provenance', OWNER]) {
        expect(listing).not.toContain(leak);
      }
    });

    it('does not name a Visin dataset or the run a checkpoint came from', async () => {
      const id = await project();
      await publishSuite(id, {}, protocol({ data: { kind: 'visin', datasetId: 'private-dataset-42', archiveSha256: 'b'.repeat(64) } }));
      const evaluation = await record(id, 'A', 0.8, 0.6);
      await publish(evaluation);
      const text = (await board()).text + (await call(`/public/evaluations/${evaluation}`, { user: ANONYMOUS })).text + (await call('/public/leaderboards', { user: ANONYMOUS })).text;
      expect(text).not.toContain('private-dataset-42');
      expect(text).not.toContain('b'.repeat(64));
      expect((await board()).body.data.suite.data).toEqual({ kind: 'visin' });
    });

    it('shows a Hub checkpoint and a Hub dataset as the pins they are', async () => {
      const id = await project({ storage: { provider: 'hf' } });
      const commit = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
      const hub = protocol({ data: { kind: 'hf', repo: 'acme/frames', commit } });
      await publishSuite(id, {}, hub);
      const evaluation = await record(id, 'A', 0.8, 0.6, {
        checkpoint: { kind: 'hf', repo: 'acme/clft', commit, path: 'best.safetensors' },
        evidence: evidenceFor(hub, { data: { kind: 'hf', repo: 'acme/frames', commit } })
      });
      await publish(evaluation);
      const data = (await board()).body.data;
      expect(data.entries[0].checkpoint).toEqual({ kind: 'hf', repo: 'acme/clft', commit, path: 'best.safetensors' });
      expect(data.suite.data).toEqual({ kind: 'hf', repo: 'acme/frames', commit });
    });

    it('leaves out what a suite or a submitter did not give, and anything that is not a short string', async () => {
      const id = await project({ storage: { provider: 'hf' } });
      const bare = protocol({ metrics: [{ key: 'm', direction: 'max', range: { min: 0, max: 1 }, headline: true }], evaluator: { package: 'p' } });
      await publishSuite(id, { description: 'Held-out frames.' }, bare);
      const withDescription = (await board()).status;
      expect(withDescription).toBe(200);
      const evidence = evidenceFor(bare);
      const plain = await record(id, 'A', 0.8, 0.6, { evidence, checkpoint: { kind: 'hf', repo: 'acme/clft', commit: 'b'.repeat(40) } });
      const odd = await record(id, 'B', 0.7, 0.7, { evidence, provenance: { evaluator: { package: 42, version: 'x'.repeat(101), commit: ['c'] } } });
      const none = await record(id, 'C', 0.6, 0.6, { evidence, provenance: { other: true } });
      await publish(plain);
      await publish(odd);
      await publish(none);
      const { suite, entries: rows } = (await board()).body.data;
      expect(suite.description).toBe('Held-out frames.');
      expect(suite.headline).toEqual({ key: 'm', direction: 'max' });
      expect(suite.evaluator).toEqual({ package: 'p' });
      expect(rows[0].checkpoint).toEqual({ kind: 'hf', repo: 'acme/clft', commit: 'b'.repeat(40) });
      for (const evaluation of [plain, odd, none]) {
        const detail = (await call(`/public/evaluations/${evaluation}`, { user: ANONYMOUS })).body.data;
        expect(detail).not.toHaveProperty('evaluator');
      }
    });

    it('says whether each public entry was observed, reported or attested, and can show the observed ones alone', async () => {
      const id = await project();
      await publishSuite(id);
      const observed = await record(id, 'Seen', 0.7, 0.7);
      const training = await Training.create({ uuid: 'run-1', name: 'Final run', ownerId: OWNER, projectId: id });
      const legacy = await recordTest({
        projectId: id, trainingId: String(training._id), epoch: 1, epoch_uuid: 'e-1', test_uuid: 't-1',
        timestamp: new Date('2026-09-01T12:00:00Z'), test_results: results(0.9, 0.9)
      });
      const promoted = await call('/evaluations/promote', {
        method: 'POST', body: { evaluationId: String(legacy._id), suite: 'road-test@1', checkpoint: local('Claimed'), sampleCounts: counts }
      });
      expect(promoted.status).toBe(201);
      const said = await record(id, 'Said', 0.5, 0.5, { evidence: undefined });
      await publish(observed);
      await publish(promoted.body.data._id);
      await publish(said);

      const all = (await board()).body.data;
      expect(all.entries.map((entry: { checkpoint: { label: string }; rank: number; evidenceLevel: string }) => [entry.checkpoint.label, entry.rank, entry.evidenceLevel])).toEqual([
        ['Claimed', 1, 'attested'],
        ['Seen', 2, 'observed'],
        ['Said', 3, 'reported']
      ]);
      expect((await call(`/public/evaluations/${promoted.body.data._id}`, { user: ANONYMOUS })).body.data.evidenceLevel).toBe('attested');
      expect((await call(`/public/evaluations/${observed}`, { user: ANONYMOUS })).body.data.evidenceLevel).toBe('observed');

      const only = (await call('/public/leaderboards/road-test/1?evidence=observed', { user: ANONYMOUS })).body.data;
      expect(only.entries.map((entry: { checkpoint: { label: string }; rank: number }) => [entry.checkpoint.label, entry.rank])).toEqual([['Seen', 1]]);
      expect(only.scope.candidates).toBe(1);
      expect((await call('/public/leaderboards/road-test/1?evidence=attested', { user: ANONYMOUS })).status).toBe(400);
    });

    it('reports when a leaderboard was last published to, from its newest result', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, 'A', 0.8, 0.6);
      const second = await record(id, 'B', 0.7, 0.7);
      const earlier = (await publish(second)).body.data.publishedAt;
      await new Promise(resolve => setTimeout(resolve, 5));
      const later = (await publish(first)).body.data.publishedAt;
      const [item] = (await call('/public/leaderboards', { user: ANONYMOUS })).body.data.leaderboards;
      expect(item.lastPublishedAt).toBe(later);
      expect(later > earlier).toBe(true);
    });

    it('does not show an evaluation that is not on a suite, is not published, or whose suite or project is gone', async () => {
      const id = await project();
      await publishSuite(id);
      const exploratory = (await call('/evaluations', { method: 'POST', body: { projectId: id, results: {} } })).body.data._id;
      const unpublished = await record(id, 'A', 0.8, 0.6);
      const published = await record(id, 'B', 0.7, 0.7);
      await publish(published);
      expect((await call(`/public/evaluations/${exploratory}`, { user: ANONYMOUS })).status).toBe(404);
      expect((await call(`/public/evaluations/${unpublished}`, { user: ANONYMOUS })).status).toBe(404);
      expect((await call('/public/evaluations/000000000000000000000fff', { user: ANONYMOUS })).status).toBe(404);
      await Suite.deleteMany({});
      expect((await call(`/public/evaluations/${published}`, { user: ANONYMOUS })).status).toBe(404);
      expect((await call('/public/leaderboards', { user: ANONYMOUS })).body.data.leaderboards).toEqual([]);
    });

    it('is never cached, and is rate limited by address', async () => {
      const id = await project();
      await publishSuite(id);
      await publish(await record(id, 'A', 0.8, 0.6));
      for (const path of ['/public/leaderboards', '/public/leaderboards/road-test/1']) {
        const response = await call(path, { user: ANONYMOUS });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('ratelimit-limit')).toBe('120');
      }
    });
  });
});
