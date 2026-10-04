import fs from 'fs';
import path from 'path';
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
import suiteRoutes from '../../routes/suiteRoutes';
import { purgeExpiredTrash } from '../../services/purgeService';
import { protocolDigest } from '../../services/suiteProtocol';
import { suiteProtocolSchema } from '../../validation/suiteSchemas';
import { fixtureEvidence } from '../fixtures/fixtureEvidence';

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

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/leaderboard.json'), 'utf8'));
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const local = (name: string) => ({ kind: 'local', sha256: sha(name), label: name });

const suiteProtocol = (overrides: Record<string, unknown> = {}) => ({
  task: 'segmentation',
  data: { kind: 'external', label: 'frames', manifestSha256: 'a'.repeat(64) },
  split: 'test',
  conditions: [{ name: 'day', sampleCount: 10 }, { name: 'night', sampleCount: 5 }],
  metrics: [{ key: 'm', direction: 'max', range: { min: 0, max: 1 }, headline: true }],
  aggregation: 'equal-mean-of-conditions',
  evaluator: { package: 'p' },
  ...overrides
});
/** What a faithful evaluator of `protocol` reports having observed, with any part replaced. */
const evidenceFor = (protocol: Record<string, unknown> = suiteProtocol(), overrides: Record<string, unknown> = {}) => ({
  data: { kind: 'external', manifestSha256: 'a'.repeat(64) },
  protocolDigest: protocolDigest(suiteProtocolSchema.parse(protocol)),
  evaluator: { package: 'p', version: '1.0.0' },
  ...overrides
});
const goodResults = (day = 0.8, night = 0.6) => ({ day: { overall: { m: day } }, night: { overall: { m: night } } });
const counts = { day: 10, night: 5 };

describe('evaluations with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'evaluations-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    await Promise.all([Suite.init(), Evaluation.init()]);
    const app = express();
    app.use(express.json({ limit: '5mb' }), identityContextMiddleware);
    app.use('/suites', suiteRoutes);
    app.use('/evaluations', evaluationRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
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
  const publishSuite = (projectId: string, overrides: Record<string, unknown> = {}, protocol = suiteProtocol()) =>
    call('/suites', { method: 'POST', body: { slug: 'road-test', version: 1, name: 'Road test', projectId, protocol, ...overrides } });
  const record = (projectId: string, overrides: Record<string, unknown> = {}, user = OWNER) =>
    call('/evaluations', { method: 'POST', user, body: { projectId, results: goodResults(), sampleCounts: counts, checkpoint: local('A'), suite: 'road-test@1', evidence: evidenceFor(), ...overrides } });

  describe('recording', () => {
    it('keeps a result with no suite as exploratory, and never ranks it', async () => {
      const id = await project();
      const created = await call('/evaluations', { method: 'POST', body: { projectId: id, results: { anything: { goes: 1 } }, uuid: 'u-1' } });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ uuid: 'u-1', projectId: id, ownerId: OWNER, status: 'completed' });
      expect(created.body.data.validation).toMatchObject({ state: 'exploratory', reasons: [{ code: 'no-suite' }] });
      expect(created.body.data.results).toEqual({ anything: { goes: 1 } });
      expect(created.body.data.receivedAt).toBeTruthy();
    });

    it('judges a result against the suite and stores the scores it read', async () => {
      const id = await project();
      const suite = await publishSuite(id);
      const created = await record(id);
      expect(created.status).toBe(201);
      expect(created.body.data.suite).toMatchObject({ slug: 'road-test', version: 1, digest: suite.body.data.digest });
      expect(created.body.data.checkpointKey).toBe(`sha256:${sha('A')}`);
      expect(created.body.data.validation.state).toBe('eligible');
      expect(created.body.data.validation.scores.overall.m).toBeCloseTo(0.7);
    });

    it('stores an incomplete or incompatible result with its reasons instead of refusing it', async () => {
      const id = await project();
      await publishSuite(id);
      const missing = await record(id, { results: { day: { overall: { m: 0.9 } } }, sampleCounts: { day: 10 } });
      expect(missing.status).toBe(201);
      expect(missing.body.data.validation).toMatchObject({ state: 'incomplete', reasons: [{ code: 'missing-condition', detail: 'night' }] });
      const wrong = await record(id, { evidence: evidenceFor(undefined, { protocolDigest: 'f'.repeat(64) }) });
      expect(wrong.body.data.validation).toMatchObject({ state: 'incompatible', reasons: [{ code: 'protocol-mismatch' }] });
      const failed = await record(id, { status: 'failed', results: {} });
      expect(failed.body.data.validation).toMatchObject({ state: 'incomplete', reasons: [{ code: 'evaluation-failed' }] });
    });

    it('answers a retry with the stored result, and refuses a different result under the same uuid', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, { uuid: 'run-1' });
      const retry = await record(id, { uuid: 'run-1' });
      expect(retry.status).toBe(200);
      expect(retry.body.data._id).toBe(first.body.data._id);
      const changed = await record(id, { uuid: 'run-1', results: goodResults(0.9, 0.9) });
      expect(changed.status).toBe(409);
      expect(changed.body.message).toContain('supersedesId');
      expect(await Evaluation.countDocuments()).toBe(1);
    });

    it('scopes a uuid to its project', async () => {
      const a = await project();
      const b = await project();
      await publishSuite(a);
      expect((await record(a, { uuid: 'same' })).status).toBe(201);
      expect((await record(b, { uuid: 'same' })).status).toBe(201);
      expect(await Evaluation.countDocuments()).toBe(2);
    });

    it('creates one row when the same upload arrives twice at once', async () => {
      const id = await project();
      await publishSuite(id);
      const both = await Promise.all([record(id, { uuid: 'race' }), record(id, { uuid: 'race' })]);
      expect(both.map(result => result.status).sort()).toEqual([200, 201]);
      const rival = await Promise.all([record(id, { uuid: 'race2' }), record(id, { uuid: 'race2', results: goodResults(0.1, 0.1) })]);
      expect(rival.map(result => result.status).sort()).toEqual([201, 409]);
      expect(await Evaluation.countDocuments()).toBe(2);
    });

    it('answers the same result run again on another machine as a retry, and keeps the first provenance', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, { uuid: 'rerun', provenance: { host: { hostname: 'node-1' }, git: { commit: 'aaaa' } } });
      expect(first.status).toBe(201);
      const again = await record(id, { uuid: 'rerun', provenance: { host: { hostname: 'node-2' }, git: { commit: 'bbbb' } } });
      expect(again.status).toBe(200);
      expect(again.body.data.provenance.host.hostname).toBe('node-1');
      // A different result under that uuid is still a conflict.
      expect((await record(id, { uuid: 'rerun', results: goodResults(0.1, 0.1) })).status).toBe(409);
    });

    it('supersedes an evaluation in the same project and only there', async () => {
      const id = await project();
      const other = await project();
      await publishSuite(id);
      const first = await record(id);
      const second = await record(id, { results: goodResults(0.9, 0.9), supersedesId: first.body.data._id });
      expect(second.body.data.supersedesId).toBe(first.body.data._id);
      const foreign = await call('/evaluations', { method: 'POST', body: { projectId: other, results: {}, supersedesId: first.body.data._id } });
      expect(foreign.status).toBe(400);
      expect((await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, supersedesId: '000000000000000000000fff' } })).status).toBe(400);
    });

    describe('a correction replaces the result it corrects', () => {
      const boardOf = async () => (await call('/suites/road-test/1/leaderboard')).body.data;

      it('takes the corrected result out of the ranking even when the correction cannot be ranked', async () => {
        const id = await project();
        await publishSuite(id);
        const first = await record(id);
        expect((await boardOf()).entries).toHaveLength(1);
        const second = await record(id, { results: { day: { overall: { m: 0.9 } } }, sampleCounts: { day: 10 }, supersedesId: first.body.data._id });
        expect(second.body.data.validation.state).toBe('incomplete');
        const board = await boardOf();
        expect(board.entries).toEqual([]);
        expect(board.unranked).toMatchObject([{ evaluationId: second.body.data._id, state: 'incomplete', attempts: 2 }]);
        expect((await call(`/evaluations/${first.body.data._id}`)).body.data.supersededById).toBe(second.body.data._id);
      });

      it('must be of the same suite and checkpoint', async () => {
        const id = await project();
        await publishSuite(id);
        const first = await record(id);
        const other = await record(id, { checkpoint: local('B'), supersedesId: first.body.data._id });
        expect(other.status).toBe(400);
        expect(other.body.message).toContain('same checkpoint');
        const exploratory = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, supersedesId: first.body.data._id } });
        expect(exploratory.status).toBe(400);
        expect(exploratory.body.message).toContain('same suite');
        expect((await boardEntries()).length).toBe(1);
      });

      const boardEntries = async () => (await boardOf()).entries as unknown[];

      it('can be made by one correction at a time, until that one is trashed', async () => {
        const id = await project();
        await publishSuite(id);
        const first = await record(id);
        const second = await record(id, { results: goodResults(0.9, 0.9), supersedesId: first.body.data._id });
        const rival = await record(id, { results: goodResults(0.1, 0.1), supersedesId: first.body.data._id });
        expect(rival.status).toBe(409);
        // Trashing the correction gives the original its place back.
        await call(`/evaluations/${second.body.data._id}`, { method: 'DELETE' });
        expect((await boardOf()).entries).toMatchObject([{ evaluationId: first.body.data._id }]);
        expect((await call(`/evaluations/${first.body.data._id}`)).body.data.supersededById).toBeUndefined();
        // And restoring it replaces the original again.
        expect((await call(`/evaluations/${second.body.data._id}/restore`, { method: 'POST' })).status).toBe(200);
        expect((await boardOf()).entries).toMatchObject([{ evaluationId: second.body.data._id }]);
      });

      it('refuses to restore a correction while another one holds the result', async () => {
        const id = await project();
        await publishSuite(id);
        const first = await record(id);
        const second = await record(id, { results: goodResults(0.9, 0.9), supersedesId: first.body.data._id });
        await call(`/evaluations/${second.body.data._id}`, { method: 'DELETE' });
        const third = await record(id, { results: goodResults(0.5, 0.5), supersedesId: first.body.data._id });
        expect(third.status).toBe(201);
        const restored = await call(`/evaluations/${second.body.data._id}/restore`, { method: 'POST' });
        expect(restored.status).toBe(409);
      });

      it('is not left half-made when the correction itself is refused', async () => {
        const id = await project();
        await publishSuite(id);
        const first = await record(id);
        await record(id, { uuid: 'taken', results: goodResults(0.2, 0.2) });
        const refused = await record(id, { uuid: 'taken', results: goodResults(0.9, 0.9), supersedesId: first.body.data._id });
        expect(refused.status).toBe(409);
        expect((await call(`/evaluations/${first.body.data._id}`)).body.data.supersededById).toBeUndefined();
      });
    });

    it('records the run a checkpoint came from, if it is in the same project', async () => {
      const id = await project();
      const elsewhere = await project();
      await Training.create({ uuid: 'run-a', name: 'Run A', ownerId: OWNER, projectId: id });
      await Training.create({ uuid: 'run-b', name: 'Run B', ownerId: OWNER, projectId: elsewhere });
      const ok = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, source: { trainingUuid: 'run-a', epochUuid: 'e1', epoch: 12 } } });
      expect(ok.body.data.source).toMatchObject({ epochUuid: 'e1', epoch: 12 });
      expect(ok.body.data.source.trainingId).toBeTruthy();
      expect((await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, source: { trainingUuid: 'run-b' } } })).status).toBe(400);
      expect((await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, source: { trainingUuid: 'nope' } } })).status).toBe(400);
    });

    it('refuses a Hub checkpoint in a project that keeps its files on Visin, and pins the commit', async () => {
      const visinProject = await project();
      const hubProject = await project({ storage: { provider: 'hf' } });
      const hf = { kind: 'hf', repo: 'acme/clft', commit: COMMIT.toUpperCase(), path: 'best.safetensors' };
      expect((await call('/evaluations', { method: 'POST', body: { projectId: visinProject, results: {}, checkpoint: hf } })).status).toBe(409);
      const ok = await call('/evaluations', { method: 'POST', body: { projectId: hubProject, results: {}, checkpoint: hf } });
      expect(ok.status).toBe(201);
      expect(ok.body.data.checkpointKey).toBe(`hf:acme/clft@${COMMIT}:best.safetensors`);
      expect((await call('/evaluations', { method: 'POST', body: { projectId: hubProject, results: {}, checkpoint: { ...hf, commit: 'main' } } })).status).toBe(400);
      expect((await call('/evaluations', { method: 'POST', body: { projectId: hubProject, results: {}, checkpoint: { kind: 'local', sha256: 'abc', label: 'x' } } })).status).toBe(400);
    });

    it('refuses credentials in provenance and oversized or malformed bodies', async () => {
      const id = await project();
      const secret = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, provenance: { env: { HF_TOKEN: 'x' }, command: 'run' } } });
      expect(secret.status).toBe(400);
      expect(secret.body.message).toContain('env.HF_TOKEN');
      const fine = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, provenance: { evaluator: { package: 'visin-fusion', version: '1.2.0' }, seeds: [1], packages: { tokenizers: '0.19.1', torch: '2.4.0' } } } });
      expect(fine.body.data.provenance.evaluator.version).toBe('1.2.0');
      let deep: Record<string, unknown> = { v: 1 };
      for (let i = 0; i < 12; i++) deep = { deeper: deep };
      expect((await call('/evaluations', { method: 'POST', body: { projectId: id, results: deep } })).status).toBe(400);
      expect((await call('/evaluations', { method: 'POST', body: { projectId: id, results: [1] } })).status).toBe(400);
      expect((await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, suite: 'road-test@latest' } })).status).toBe(400);
    });

    it('refuses a new result on an archived suite and keeps the old ones', async () => {
      const id = await project();
      await publishSuite(id);
      await record(id, { uuid: 'before' });
      await call('/suites/road-test/1', { method: 'PATCH', body: { archived: true } });
      const refused = await record(id, { uuid: 'after' });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toContain('archived');
      expect((await call('/suites/road-test/1/leaderboard')).body.data.entries).toHaveLength(1);
    });

    it('does not find a suite the caller cannot read', async () => {
      const mine = await project({ owner: { kind: 'user', id: OWNER } });
      const theirs = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      await publishSuite(mine);
      const attempt = await call('/evaluations', { method: 'POST', user: STRANGER, body: { projectId: theirs, results: goodResults(), suite: 'road-test@1' } });
      expect(attempt.status).toBe(404);
      expect(await Evaluation.countDocuments()).toBe(0);
    });

    it('uses a public suite from another project', async () => {
      const home = await project();
      const away = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      await publishSuite(home, { visibility: 'public' });
      const created = await call('/evaluations', { method: 'POST', user: STRANGER, body: { projectId: away, results: goodResults(), sampleCounts: counts, checkpoint: local('S'), suite: 'road-test@1', evidence: evidenceFor() } });
      expect(created.status).toBe(201);
      expect(created.body.data.validation.state).toBe('eligible');
    });
  });

  describe('edges', () => {
    it('takes a source that names only an epoch, and a supersedes that is not an id', async () => {
      const id = await project();
      const created = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, source: { epochUuid: 'e-9' } } });
      expect(created.body.data.source).toEqual({ epochUuid: 'e-9' });
      expect((await call('/evaluations', { method: 'POST', body: { projectId: id, results: {}, supersedesId: 'x' } })).status).toBe(400);
    });

    it('answers not found for a project, an evaluation or a uuid that is not there', async () => {
      const id = await project();
      expect((await call('/evaluations', { method: 'POST', body: { projectId: 'nowhere', results: {} } })).status).toBe(404);
      expect((await call(`/evaluations?projectId=nowhere`)).body.data.evaluations).toEqual([]);
      expect((await call(`/evaluations/uuid/none?projectId=${id}`)).status).toBe(404);
      expect((await call('/evaluations/uuid/none?projectId=nowhere')).status).toBe(404);
      expect((await call('/evaluations/000000000000000000000fff')).status).toBe(404);
      expect((await call('/evaluations/000000000000000000000fff', { method: 'DELETE' })).status).toBe(404);
    });

    it('does not read an evaluation whose project is gone', async () => {
      const id = await project();
      const created = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {} } });
      await Project.deleteOne({ _id: id });
      expect((await call(`/evaluations/${created.body.data._id}`)).status).toBe(404);
      expect((await call(`/evaluations/${created.body.data._id}`, { method: 'DELETE' })).status).toBe(404);
    });

    it('restores one that is not in the trash without changing it, and trashes one twice', async () => {
      const id = await project();
      const created = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {} } });
      const evalId = created.body.data._id;
      expect((await call(`/evaluations/${evalId}/restore`, { method: 'POST' })).status).toBe(200);
      const first = await call(`/evaluations/${evalId}`, { method: 'DELETE' });
      expect(first.status).toBe(200);
      expect((await call(`/evaluations/${evalId}`, { method: 'DELETE' })).status).toBe(200);
      expect((await Evaluation.findById(evalId))?.deletedAt).toBeTruthy();
    });

    it('generates a uuid when none is sent, so two such uploads are two evaluations', async () => {
      const id = await project();
      const a = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {} } });
      const b = await call('/evaluations', { method: 'POST', body: { projectId: id, results: {} } });
      expect(a.body.data.uuid).not.toBe(b.body.data.uuid);
      expect(await Evaluation.countDocuments()).toBe(2);
    });
  });

  describe('dry run', () => {
    it('judges a result with no suite and no checkpoint as exploratory', async () => {
      const id = await project();
      const checked = await call('/evaluations/check', { method: 'POST', body: { projectId: id, results: {} } });
      expect(checked.body.data).toEqual({ validation: expect.objectContaining({ state: 'exploratory' }) });
    });

    it('reports what recording would judge, and stores nothing', async () => {
      const id = await project();
      await publishSuite(id);
      const checked = await call('/evaluations/check', { method: 'POST', body: { projectId: id, suite: 'road-test@1', checkpoint: local('A'), results: { day: { overall: { m: 2 } } }, sampleCounts: { day: 10 }, evidence: evidenceFor() } });
      expect(checked.status).toBe(200);
      expect(checked.body.data.validation.state).toBe('incompatible');
      expect(checked.body.data.validation.reasons).toEqual([
        { code: 'metric-out-of-range', detail: 'day/m' },
        { code: 'missing-condition', detail: 'night' }
      ]);
      expect(checked.body.data.checkpointKey).toBe(`sha256:${sha('A')}`);
      expect(checked.body.data.suite).toMatchObject({ slug: 'road-test', version: 1 });
      expect(await Evaluation.countDocuments()).toBe(0);
    });

    it('refuses a Hub checkpoint on a project that keeps its files on Visin, as recording does', async () => {
      const id = await project();
      await publishSuite(id);
      const body = { projectId: id, suite: 'road-test@1', checkpoint: { kind: 'hf', repo: 'acme/clft', commit: COMMIT }, results: goodResults(), sampleCounts: counts, evidence: evidenceFor() };
      const checked = await call('/evaluations/check', { method: 'POST', body });
      expect(checked.status).toBe(409);
      expect(checked.body.message).toContain('Switch its storage to Hugging Face');
      expect((await call('/evaluations', { method: 'POST', body })).status).toBe(409);

      await Project.updateOne({ _id: id }, { storage: { provider: 'hf' } });
      expect((await call('/evaluations/check', { method: 'POST', body })).status).toBe(200);
    });

    it('needs the access that recording needs', async () => {
      const id = await project();
      await publishSuite(id);
      const body = { projectId: id, suite: 'road-test@1', results: {} };
      expect((await call('/evaluations/check', { method: 'POST', user: ANONYMOUS, body })).status).toBe(401);
      expect((await call('/evaluations/check', { method: 'POST', user: STRANGER, body })).status).toBe(404);
    });
  });

  describe('access', () => {
    it('lets a contributor record, and a reader or stranger not', async () => {
      const id = await project();
      const open = await project({ visibility: 'public' });
      await publishSuite(id, { visibility: 'public' });
      expect((await record(id, {}, MEMBER)).status).toBe(201);
      expect((await record(id, {}, STRANGER)).status).toBe(404);
      expect((await record(open, {}, STRANGER)).status).toBe(403);
      expect((await record(id, {}, ANONYMOUS)).status).toBe(401);
    });

    it('hides a private project\'s evaluations from strangers in lists, details, uuid lookups and leaderboards', async () => {
      const id = await project();
      await publishSuite(id, { visibility: 'public' });
      const created = await record(id, { uuid: 'secret-run' });
      const evalId = created.body.data._id;
      expect((await call('/evaluations', { user: STRANGER })).body.data.evaluations).toEqual([]);
      expect((await call(`/evaluations/${evalId}`, { user: STRANGER })).status).toBe(404);
      expect((await call(`/evaluations/${evalId}`, { user: ANONYMOUS })).status).toBe(404);
      expect((await call(`/evaluations/uuid/secret-run?projectId=${id}`, { user: STRANGER })).status).toBe(404);
      const board = await call('/suites/road-test/1/leaderboard', { user: STRANGER });
      expect(board.status).toBe(200);
      expect(board.body.data).toMatchObject({ entries: [], unranked: [], scope: { candidates: 0 } });
      expect((await call(`/evaluations/${evalId}`, { user: MEMBER })).status).toBe(200);
      expect((await call(`/evaluations/uuid/secret-run?projectId=${id}`, { user: MEMBER })).body.data._id).toBe(evalId);
    });

    it('shows a public project\'s published evaluations to anyone, and its others only to the people in it', async () => {
      const id = await project({ visibility: 'public' });
      await publishSuite(id, { visibility: 'public' });
      const kept = await record(id, { uuid: 'kept-private', checkpoint: local('P') });
      const shown = await record(id, { uuid: 'shown', checkpoint: local('S'), results: goodResults(0.9, 0.9), provenance: { evaluator: { package: 'p', version: '1' }, host: { hostname: 'gpu-node-17' }, command: 'python run.py' } });
      expect((await call(`/evaluations/${shown.body.data._id}/publish`, { method: 'POST' })).status).toBe(200);

      // Anyone: only what was published, with no person's id and none of how the run was set up.
      const anonymous = (await call('/evaluations', { user: ANONYMOUS })).body.data.evaluations;
      expect(anonymous.map((row: { uuid: string }) => row.uuid)).toEqual(['shown']);
      expect(anonymous[0]).not.toHaveProperty('ownerId');
      expect((await call(`/evaluations/${kept.body.data._id}`, { user: ANONYMOUS })).status).toBe(404);
      expect((await call(`/evaluations/${kept.body.data._id}`, { user: STRANGER })).status).toBe(404);
      expect((await call(`/evaluations/uuid/kept-private?projectId=${id}`, { user: ANONYMOUS })).status).toBe(404);
      const detail = (await call(`/evaluations/${shown.body.data._id}`, { user: ANONYMOUS })).body.data;
      expect(detail).not.toHaveProperty('ownerId');
      expect(detail.results).toBeTruthy();
      expect(detail.provenance).toEqual({ evaluator: { package: 'p', version: '1' } });
      expect((await call(`/evaluations/uuid/shown?projectId=${id}`, { user: STRANGER })).body.data.provenance).toEqual({ evaluator: { package: 'p', version: '1' } });

      // The people in the project see all of it, as recorded.
      const member = (await call('/evaluations', { user: MEMBER })).body.data.evaluations;
      expect(member.map((row: { uuid: string }) => row.uuid).sort()).toEqual(['kept-private', 'shown']);
      expect(member[0].ownerId).toBeTruthy();
      expect((await call(`/evaluations/${shown.body.data._id}`, { user: MEMBER })).body.data.provenance.host.hostname).toBe('gpu-node-17');

      // The board a stranger can open ranks the published row only, where the project is public to them.
      expect((await call('/suites/road-test/1/leaderboard', { user: ANONYMOUS })).body.data.entries.map((entry: { uuid: string }) => entry.uuid)).toEqual(['shown']);
      expect((await call('/suites/road-test/1/leaderboard', { user: MEMBER })).body.data.entries).toHaveLength(2);
    });

    it('does not tell a public reader who vouched for a promoted result', async () => {
      const id = await project({ visibility: 'public' });
      await publishSuite(id, { visibility: 'public' });
      const training = await Training.create({ uuid: 'run-attest', name: 'Final run', ownerId: OWNER, projectId: id });
      const testResult = await recordTest({ projectId: id, trainingId: String(training._id), epoch: 1, epoch_uuid: 'e-a', test_uuid: 't-a', timestamp: new Date(), test_results: goodResults() });
      const promoted = await call('/evaluations/promote', { method: 'POST', body: { evaluationId: String(testResult._id), suite: 'road-test@1', checkpoint: local('A'), sampleCounts: counts } });
      expect(promoted.body.data.evidence.by).toBe(OWNER);
      await call(`/evaluations/${promoted.body.data._id}/publish`, { method: 'POST' });
      const seen = (await call(`/evaluations/${promoted.body.data._id}`, { user: ANONYMOUS })).body.data;
      expect(seen.evidence).toMatchObject({ kind: 'attested', evaluationId: String(testResult._id) });
      expect(seen.evidence).not.toHaveProperty('by');
      expect(seen.provenance).toBeUndefined();
    });

    it('trashes and restores: a contributor their own, a manager anyone\'s', async () => {
      const id = await project();
      await publishSuite(id);
      const mine = await record(id, { uuid: 'm', checkpoint: local('M') }, MEMBER);
      const owners = await record(id, { uuid: 'o', checkpoint: local('O') }, OWNER);
      expect((await call(`/evaluations/${owners.body.data._id}`, { method: 'DELETE', user: MEMBER })).status).toBe(403);
      expect((await call(`/evaluations/${mine.body.data._id}`, { method: 'DELETE', user: MEMBER })).status).toBe(200);
      expect((await call(`/evaluations/${owners.body.data._id}`, { method: 'DELETE', user: ADMIN })).status).toBe(200);
      expect((await call('/evaluations')).body.data.evaluations).toEqual([]);
      expect((await call(`/evaluations/${mine.body.data._id}`)).status).toBe(404);
      expect((await call('/suites/road-test/1/leaderboard')).body.data.entries).toEqual([]);
      expect((await call(`/evaluations/${mine.body.data._id}/restore`, { method: 'POST', user: MEMBER })).status).toBe(200);
      expect((await call('/evaluations')).body.data.evaluations).toHaveLength(1);
      expect((await call(`/evaluations/${mine.body.data._id}`, { method: 'DELETE', user: STRANGER })).status).toBe(404);
      expect((await call('/evaluations/not-an-id', { method: 'DELETE' })).status).toBe(404);
    });

    it('filters and pages lists, and leaves the result blobs out of them', async () => {
      const id = await project();
      await publishSuite(id);
      await record(id, { uuid: '1', checkpoint: local('A') });
      await record(id, { uuid: '2', checkpoint: local('B'), results: {} });
      await record(id, { uuid: '3', checkpoint: undefined, suite: undefined });
      const all = await call('/evaluations');
      expect(all.body.data.evaluations.map((row: { uuid: string }) => row.uuid)).toEqual(['3', '2', '1']);
      expect(all.body.data.evaluations[0]).not.toHaveProperty('results');
      expect((await call('/evaluations?suite=road-test@1')).body.data.evaluations).toHaveLength(2);
      expect((await call('/evaluations?state=eligible')).body.data.evaluations).toHaveLength(1);
      expect((await call('/evaluations?state=exploratory')).body.data.evaluations).toHaveLength(1);
      expect((await call(`/evaluations?checkpointKey=${encodeURIComponent(`sha256:${sha('B')}`)}`)).body.data.evaluations).toHaveLength(1);
      expect((await call(`/evaluations?projectId=${id}&status=failed`)).body.data.evaluations).toEqual([]);
      expect((await call('/evaluations?suite=bad')).status).toBe(400);
      const paged = await call('/evaluations?limit=2&page=2');
      expect(paged.body.data.evaluations).toHaveLength(1);
      expect(paged.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });
    });
  });

  describe('the comparison fixture, through the API', () => {
    /** A promoted fixture result: the legacy test result carries the results, the manager the checkpoint and counts. */
    const promoteFixture = async (projectId: string, suite: string, evaluation: { id: string; checkpoint: string; results: unknown; sampleCounts: Record<string, number> }) => {
      const training = await Training.create({ uuid: `run-${evaluation.id}`, name: 'Final run', ownerId: OWNER, projectId });
      const testResult = await recordTest({
        projectId, trainingId: String(training._id), epoch: 1, epoch_uuid: `e-${evaluation.id}`, test_uuid: `t-${evaluation.id}`,
        timestamp: new Date('2026-09-01T12:00:00Z'), test_results: evaluation.results
      });
      return call('/evaluations/promote', {
        method: 'POST',
        body: { evaluationId: String(testResult._id), suite: `${suite}@1`, checkpoint: local(evaluation.checkpoint), sampleCounts: evaluation.sampleCounts }
      });
    };

    it.each(['road', 'errors'])('ranks the %s suite as the contract says', async name => {
      const id = await project({ visibility: 'public' });
      const protocol = fixture.suites[name];
      const published = await publishSuite(id, { slug: name, version: 1, name }, protocol);
      expect(published.status).toBe(201);

      // Posted in arrival order, so the server's own clock orders the attempts as the fixture's did.
      const mine = fixture.evaluations
        .filter((evaluation: { suite: string }) => evaluation.suite === name)
        .sort((a: { receivedAt: string }, b: { receivedAt: string }) => a.receivedAt.localeCompare(b.receivedAt));
      // A promoted result gets a uuid from the server, so it is known to the fixture by id alone.
      const named: Record<string, string> = {};
      for (const evaluation of mine) {
        const evidence = fixtureEvidence(fixture.suiteEvidence[name], evaluation, protocolDigest(suiteProtocolSchema.parse(protocol)));
        const response = evaluation.attested
          ? await promoteFixture(id, name, evaluation)
          : await call('/evaluations', {
              method: 'POST',
              body: {
                projectId: id,
                uuid: evaluation.id,
                suite: `${name}@1`,
                status: evaluation.status,
                results: evaluation.results,
                ...(evaluation.sampleCounts ? { sampleCounts: evaluation.sampleCounts } : {}),
                ...(evaluation.checkpoint ? { checkpoint: local(evaluation.checkpoint) } : {}),
                ...(evidence ? { evidence } : {})
              }
            });
        expect(response.status).toBe(201);
        named[response.body.data.uuid] = evaluation.id;
        const want = fixture.expected.states[evaluation.id];
        expect(response.body.data.validation.state).toBe(want.state);
        expect(response.body.data.validation.reasons).toEqual(want.reasons ?? []);
        expect(response.body.data.validation.warnings).toEqual(want.warnings ?? []);
        if (want.evidence) expect(response.body.data.validation.evidence).toBe(want.evidence);
        await new Promise(resolve => setTimeout(resolve, 3));
      }

      const board = (await call(`/suites/${name}/1/leaderboard`)).body.data;
      const want = fixture.expected.leaderboards[name];
      expect(board.selection).toBe('latest-eligible-completed');
      expect(board.suite).toMatchObject({ slug: name, version: 1 });
      expect(board.entries.map((entry: { uuid: string; rank: number; attempts: number }) => [named[entry.uuid], entry.rank, entry.attempts])).toEqual(
        want.entries.map((entry: { id: string; rank: number; attempts: number }) => [entry.id, entry.rank, entry.attempts])
      );
      board.entries.forEach((entry: { summary: { headline: { value: number }; worst: { condition: string; value: number }; gap: number }; project: { _id: string } }, index: number) => {
        expect(entry.summary.headline.value).toBeCloseTo(want.entries[index].headline, 9);
        expect(entry.summary.worst.condition).toBe(want.entries[index].worst.condition);
        expect(entry.summary.gap).toBeCloseTo(want.entries[index].gap, 9);
        expect(entry.project._id).toBe(id);
      });
      const unranked = [...board.unranked].sort((a: { uuid: string }, b: { uuid: string }) => (named[a.uuid] < named[b.uuid] ? -1 : 1));
      expect(unranked.map((row: { uuid: string; state: string }) => [named[row.uuid], row.state])).toEqual(
        [...want.unranked].sort((a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1)).map((row: { id: string; state: string }) => [row.id, row.state])
      );
      for (const row of board.unranked) expect(row.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('observed evidence', () => {
    it('stores what the evaluator observed and judges it against the suite', async () => {
      const id = await project();
      await publishSuite(id);
      const good = await record(id, { uuid: 'good' });
      expect(good.body.data.validation).toMatchObject({ state: 'eligible', evidence: 'observed' });
      expect(good.body.data.evidence).toEqual({ kind: 'observed', ...evidenceFor() });

      const otherData = await record(id, { uuid: 'data', evidence: evidenceFor(undefined, { data: { kind: 'external', manifestSha256: 'b'.repeat(64) } }) });
      expect(otherData.body.data.validation).toMatchObject({ state: 'incompatible', reasons: [{ code: 'data-mismatch', detail: 'manifestSha256' }] });
    });

    it('ranks the minimal submission: results, suite, checkpoint and counts, with no evidence at all', async () => {
      const id = await project();
      await publishSuite(id);
      const minimal = await record(id, { uuid: 'minimal', evidence: undefined });
      expect(minimal.status).toBe(201);
      expect(minimal.body.data.validation).toMatchObject({ state: 'eligible', evidence: 'reported', reasons: [] });
      expect(minimal.body.data.validation.warnings.map((warning: { code: string }) => warning.code)).toEqual(['no-data-evidence', 'no-protocol-evidence', 'no-evaluator-evidence']);
      expect(minimal.body.data.evidence).toBeUndefined();

      const partial = await record(id, { uuid: 'partial', checkpoint: local('B'), evidence: { evaluator: { package: 'p', version: '1.0.0' } } });
      expect(partial.body.data.validation).toMatchObject({ state: 'eligible', evidence: 'reported' });
      expect(partial.body.data.validation.warnings.map((warning: { code: string }) => warning.code)).toEqual(['no-data-evidence', 'no-protocol-evidence']);

      const wrong = await record(id, { uuid: 'wrong', checkpoint: local('C'), evidence: { protocolDigest: 'f'.repeat(64) } });
      expect(wrong.body.data.validation).toMatchObject({ state: 'incompatible', reasons: [{ code: 'protocol-mismatch' }] });
    });

    it('ignores the old top-level suiteDigest, wrong or not, rather than trusting it as evidence', async () => {
      const id = await project();
      const published = await publishSuite(id);
      const sent = await record(id, { uuid: 'old', evidence: undefined, suiteDigest: 'f'.repeat(64) });
      expect(sent.body.data.validation).toMatchObject({ state: 'eligible', evidence: 'reported' });
      expect(published.status).toBe(201);
    });

    it('tells a retry from a different result by its evidence too', async () => {
      const id = await project();
      await publishSuite(id);
      expect((await record(id, { uuid: 'r' })).status).toBe(201);
      expect((await record(id, { uuid: 'r' })).status).toBe(200);
      const changed = await record(id, { uuid: 'r', evidence: evidenceFor(undefined, { evaluator: { package: 'p', version: '9.9.9' } }) });
      expect(changed.status).toBe(409);
    });

    it('does not call a retry of something in the trash "already recorded"', async () => {
      const id = await project();
      await publishSuite(id);
      const first = await record(id, { uuid: 'again' });
      await call(`/evaluations/${first.body.data._id}`, { method: 'DELETE' });
      const retry = await record(id, { uuid: 'again' });
      expect(retry.status).toBe(409);
      expect(retry.body.message).toContain('is in the trash');
      await call(`/evaluations/${first.body.data._id}/restore`, { method: 'POST' });
      expect((await record(id, { uuid: 'again' })).status).toBe(200);
    });

    it('refuses evidence that is malformed instead of storing it', async () => {
      const id = await project();
      await publishSuite(id);
      for (const evidence of [
        { ...evidenceFor(), protocolDigest: 'nope' },
        { ...evidenceFor(), data: { kind: 'external' } },
        { ...evidenceFor(), evaluator: { package: 'p' } },
        { ...evidenceFor(), extra: 1 },
        { ...evidenceFor(), classes: { scored: 'car' } }
      ]) {
        expect((await record(id, { evidence })).status).toBe(400);
      }
    });

    it('marks each ranked row observed, reported or attested, and can rank the observed ones alone', async () => {
      const id = await project({ visibility: 'public' });
      await publishSuite(id);
      await record(id, { uuid: 'seen', checkpoint: local('seen'), results: goodResults(0.7, 0.7) });
      await record(id, { uuid: 'said', checkpoint: local('said'), results: goodResults(0.5, 0.5), evidence: undefined });
      const training = await Training.create({ uuid: 'run-p', name: 'Final run', ownerId: OWNER, projectId: id });
      const testResult = await recordTest({
        projectId: id, trainingId: String(training._id), epoch: 1, epoch_uuid: 'e-p', test_uuid: 't-p',
        timestamp: new Date('2026-09-01T12:00:00Z'), test_results: goodResults(0.9, 0.9)
      });
      const promoted = await call('/evaluations/promote', {
        method: 'POST', body: { evaluationId: String(testResult._id), suite: 'road-test@1', checkpoint: local('claimed'), sampleCounts: counts }
      });
      expect(promoted.status).toBe(201);

      const board = (await call('/suites/road-test/1/leaderboard')).body.data;
      expect(board.entries.map((entry: { checkpoint: { label: string }; evidenceLevel: string; rank: number }) => [entry.checkpoint.label, entry.evidenceLevel, entry.rank])).toEqual([
        ['claimed', 'attested', 1],
        ['seen', 'observed', 2],
        ['said', 'reported', 3]
      ]);
      expect(board.scope.candidates).toBe(3);

      const observedOnly = (await call('/suites/road-test/1/leaderboard?evidence=observed')).body.data;
      expect(observedOnly.entries.map((entry: { checkpoint: { label: string }; rank: number }) => [entry.checkpoint.label, entry.rank])).toEqual([['seen', 1]]);
      expect(observedOnly.scope.candidates).toBe(1);
      expect((await call('/suites/road-test/1/leaderboard?evidence=attested')).status).toBe(400);
    });
  });

  describe('checking a protocol file', () => {
    it('returns the digest the server would store, without storing anything', async () => {
      const id = await project();
      const protocol = suiteProtocol({ aggregation: 'sample-weighted-mean' });
      const checked = await call('/suites/check', { method: 'POST', body: { protocol } });
      expect(checked.status).toBe(200);
      expect(checked.body.data.digest).toBe(protocolDigest(suiteProtocolSchema.parse(protocol)));
      expect(checked.body.data.protocol).toMatchObject({ classes: [], ignoredClasses: [], input: {} });
      expect(await Suite.countDocuments()).toBe(0);

      const published = await publishSuite(id, {}, protocol);
      expect(published.body.data.digest).toBe(checked.body.data.digest);
    });

    it('gives the same digest for the same protocol however its defaults are spelled, and another for a changed one', async () => {
      const bare = (await call('/suites/check', { method: 'POST', body: { protocol: suiteProtocol() } })).body.data.digest;
      const spelled = (await call('/suites/check', { method: 'POST', body: { protocol: suiteProtocol({ classes: [], ignoredClasses: [], input: {} }) } })).body.data.digest;
      const changed = (await call('/suites/check', { method: 'POST', body: { protocol: suiteProtocol({ split: 'val' }) } })).body.data.digest;
      expect(spelled).toBe(bare);
      expect(changed).not.toBe(bare);
    });

    it('needs a login and a valid protocol', async () => {
      expect((await call('/suites/check', { method: 'POST', user: ANONYMOUS, body: { protocol: suiteProtocol() } })).status).toBe(401);
      expect((await call('/suites/check', { method: 'POST', body: { protocol: { task: 'x' } } })).status).toBe(400);
      expect((await call('/suites/check', { method: 'POST', body: {} })).status).toBe(400);
    });
  });

  describe('promoting a legacy test result', () => {
    const legacyResults = () => ({
      day: { overall: { m: 0.8 }, vehicle: { iou: 0.8 } },
      night: { overall: { m: 0.6 }, vehicle: { iou: 0.6 } },
      inference_time: { avg_per_sample_ms: 12 }
    });
    const legacy = async (projectId: string, overrides: Record<string, unknown> = {}) => {
      const training = await Training.create({ uuid: `run-${new mongoose.Types.ObjectId()}`, name: 'Final run', ownerId: OWNER, projectId });
      return String((await recordTest({
        projectId, trainingId: String(training._id), epoch: 40, epoch_uuid: 'e-40', test_uuid: `t-${new mongoose.Types.ObjectId()}`,
        timestamp: new Date('2026-09-01T12:00:00Z'), test_results: legacyResults(), ...overrides
      }))._id);
    };
    const promote = (evaluationId: string, overrides: Record<string, unknown> = {}, user = OWNER) =>
      call('/evaluations/promote', { method: 'POST', user, body: { evaluationId, suite: 'road-test@1', checkpoint: local('final'), sampleCounts: counts, ...overrides } });

    it('copies the results unchanged, records where they came from, and judges them like any other', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      const before = JSON.stringify((await Evaluation.findById(evaluationId))!.toObject());

      const promoted = await promote(evaluationId);
      expect(promoted.status).toBe(201);
      const data = promoted.body.data;
      expect(data.results).toEqual(legacyResults());
      expect(data.source).toMatchObject({ epochUuid: 'e-40', epoch: 40, evaluationId });
      expect(data.source.trainingId).toBeTruthy();
      expect(data.provenance.promoted).toMatchObject({ evaluationId, by: OWNER });
      expect(data.executedAt).toBe('2026-09-01T12:00:00.000Z');
      expect(data.validation.state).toBe('eligible');
      expect(data.checkpointKey).toBe(`sha256:${sha('final')}`);
      expect(JSON.stringify((await Evaluation.findById(evaluationId))!.toObject())).toBe(before);

      const board = (await call('/suites/road-test/1/leaderboard')).body.data;
      expect(board.entries).toHaveLength(1);
      expect(board.entries[0].summary.headline.value).toBeCloseTo(0.7);
    });

    it('returns the first when promoted again, refuses another checkpoint, and allows it once that one is trashed', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      const first = await promote(evaluationId);
      const again = await promote(evaluationId);
      expect(again.status).toBe(200);
      expect(again.body.data._id).toBe(first.body.data._id);

      const other = await promote(evaluationId, { checkpoint: local('other') });
      expect(other.status).toBe(409);
      expect(other.body.message).toContain('Trash that evaluation');

      await call(`/evaluations/${first.body.data._id}`, { method: 'DELETE' });
      const redone = await promote(evaluationId, { checkpoint: local('other') });
      expect(redone.status).toBe(201);
      expect(redone.body.data._id).not.toBe(first.body.data._id);
      expect(await Evaluation.countDocuments({ 'source.evaluationId': { $exists: true } })).toBe(2);
    });

    it('records the manager\'s claim as an attestation and invents no observed evidence', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      const promoted = await promote(evaluationId);
      expect(promoted.status).toBe(201);
      const { evidence, validation } = promoted.body.data;
      expect(validation).toMatchObject({ state: 'eligible', evidence: 'attested', reasons: [], warnings: [] });
      expect(evidence).toMatchObject({ kind: 'attested', by: OWNER, evaluationId, claims: { checkpoint: local('final'), sampleCounts: counts } });
      expect(evidence.at).toBeTruthy();
      for (const invented of ['data', 'protocolDigest', 'evaluator', 'classes']) expect(evidence).not.toHaveProperty(invented);
      const stored = await Evaluation.findById(promoted.body.data._id);
      expect(stored?.evidence).toMatchObject({ kind: 'attested' });
    });

    it('stores one promotion when the same result is promoted twice at once', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      const both = await Promise.all([promote(evaluationId), promote(evaluationId)]);
      expect(both.map(response => response.status).sort()).toEqual([200, 201]);
      expect(both[0].body.data._id).toBe(both[1].body.data._id);
      expect(await Evaluation.countDocuments({ 'source.evaluationId': { $exists: true } })).toBe(1);
    });

    it('does not let a trashed promotion be restored beside a live one of the same result', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      const first = await promote(evaluationId);
      await call(`/evaluations/${first.body.data._id}`, { method: 'DELETE' });
      const second = await promote(evaluationId, { checkpoint: local('other') });
      expect(second.status).toBe(201);

      const restored = await call(`/evaluations/${first.body.data._id}/restore`, { method: 'POST' });
      expect(restored.status).toBe(409);
      expect(restored.body.message).toContain('already live');
      await call(`/evaluations/${second.body.data._id}`, { method: 'DELETE' });
      expect((await call(`/evaluations/${first.body.data._id}/restore`, { method: 'POST' })).status).toBe(200);
    });

    it('refuses a promotion whose counts differ from the stored one, and still replays an exact retry after the suite is archived', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      const first = await promote(evaluationId);
      expect(first.status).toBe(201);

      for (const changed of [{ ...counts, day: counts.day + 1 }, { day: counts.day }, { ...counts, dusk: 3 }]) {
        const refused = await promote(evaluationId, { sampleCounts: changed });
        expect(refused.status).toBe(409);
        expect(refused.body.message).toContain('different sample counts');
      }

      await call('/suites/road-test/1', { method: 'PATCH', body: { archived: true } });
      const replay = await promote(evaluationId);
      expect(replay.status).toBe(200);
      expect(replay.body.data._id).toBe(first.body.data._id);
      expect((await promote(await legacy(id))).status).toBe(409);
      expect(await Evaluation.countDocuments({ 'source.evaluationId': { $exists: true } })).toBe(1);
    });

    it('needs manage on the project, and shows a stranger only that it is not found', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      expect((await promote(evaluationId, {}, MEMBER)).status).toBe(403);
      expect((await promote(evaluationId, {}, STRANGER)).status).toBe(404);
      expect((await promote(evaluationId, {}, ANONYMOUS)).status).toBe(401);
      expect(await Evaluation.countDocuments({ 'source.evaluationId': { $exists: true } })).toBe(0);
      expect((await promote(evaluationId, {}, ADMIN)).status).toBe(201);
    });

    it('does not find an evaluation that is missing, trashed, or not an id', async () => {
      const id = await project();
      await publishSuite(id);
      const trashed = await legacy(id, { deletedAt: new Date() });
      for (const evaluationId of ['000000000000000000000fff', trashed]) {
        expect((await promote(evaluationId)).status).toBe(404);
      }
      expect((await promote('nope')).status).toBe(400);
    });

    it('refuses a failed evaluation, and one already judged on that suite', async () => {
      const id = await project();
      await publishSuite(id);
      const failed = await record(id, { uuid: 'failed-run', status: 'failed', results: {} });
      expect((await promote(failed.body.data._id)).status).toBe(409);
      const judged = await record(id, { uuid: 'judged' });
      const refused = await promote(judged.body.data._id, { checkpoint: local('again') });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toContain('already judged on that suite');
      expect(await Evaluation.countDocuments({ 'source.evaluationId': { $exists: true } })).toBe(0);
    });

    it('can copy a result judged on another suite version onto this one', async () => {
      const id = await project();
      await publishSuite(id);
      await publishSuite(id, { version: 2 });
      const first = await record(id, { uuid: 'on-v1' });
      const promoted = await call('/evaluations/promote', { method: 'POST', body: { evaluationId: first.body.data._id, suite: 'road-test@2', checkpoint: local('A'), sampleCounts: counts } });
      expect(promoted.status).toBe(201);
      expect(promoted.body.data.suite).toMatchObject({ slug: 'road-test', version: 2 });
      expect(promoted.body.data.validation.evidence).toBe('attested');
    });

    it('stores a result that cannot be ranked with its reasons', async () => {
      const id = await project();
      await publishSuite(id);
      const missingNight = await legacy(id, { test_results: { day: { overall: { m: 0.8 } } } });
      const promoted = await promote(missingNight, {}, OWNER);
      expect(promoted.status).toBe(201);
      expect(promoted.body.data.validation).toMatchObject({ state: 'incomplete', reasons: [{ code: 'missing-condition', detail: 'night' }] });
      expect((await call('/suites/road-test/1/leaderboard')).body.data.unranked).toHaveLength(1);
    });

    it('applies the same rules as recording: storage, archived suites, unknown suites, and what must be supplied', async () => {
      const id = await project();
      await publishSuite(id);
      const evaluationId = await legacy(id);
      const hf = { kind: 'hf', repo: 'acme/clft', commit: COMMIT };
      expect((await promote(evaluationId, { checkpoint: hf })).status).toBe(409);
      expect((await promote(evaluationId, { suite: 'nope@1' })).status).toBe(404);
      expect((await promote(evaluationId, { sampleCounts: undefined })).status).toBe(400);
      expect((await promote(evaluationId, { checkpoint: undefined })).status).toBe(400);
      await call('/suites/road-test/1', { method: 'PATCH', body: { archived: true } });
      expect((await promote(evaluationId)).status).toBe(409);
      expect(await Evaluation.countDocuments({ 'source.evaluationId': { $exists: true } })).toBe(0);
    });
  });

  describe('retention', () => {
    it('hides a trashed project\'s evaluations and suites, and purges them with it, keeping a suite another project still uses', async () => {
      const gone = await project();
      const staying = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      await publishSuite(gone, { slug: 'only-here' });
      await publishSuite(gone, { slug: 'shared-out', visibility: 'public' });
      await record(gone, { uuid: 'g1', suite: 'only-here@1' });
      await call('/evaluations', { method: 'POST', user: STRANGER, body: { projectId: staying, uuid: 's1', suite: 'shared-out@1', results: goodResults(), sampleCounts: counts, checkpoint: local('S') } });

      await Project.updateOne({ _id: gone }, { trashedAt: new Date() });
      expect((await call('/evaluations')).body.data.evaluations).toEqual([]);
      expect((await call('/evaluations', { user: STRANGER })).body.data.evaluations).toHaveLength(1);
      expect((await call('/suites/shared-out/1/leaderboard', { user: STRANGER })).status).toBe(404);

      await Project.updateOne({ _id: gone }, { trashedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) });
      await purgeExpiredTrash();
      expect(await Evaluation.find({ projectId: gone })).toEqual([]);
      expect(await Evaluation.countDocuments({ projectId: staying })).toBe(1);
      expect((await Suite.find()).map(suite => suite.slug)).toEqual(['shared-out']);
    });
  });

  describe('retention of suites', () => {
    it('removes a suite left behind by an earlier purge once the last evaluation that used it is purged', async () => {
      const first = await project();
      const second = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      await publishSuite(first, { slug: 'borrowed', visibility: 'public' });
      await call('/evaluations', { method: 'POST', user: STRANGER, body: { projectId: second, uuid: 's1', suite: 'borrowed@1', results: goodResults(), sampleCounts: counts, checkpoint: local('S'), evidence: evidenceFor() } });
      const long = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

      await Project.updateOne({ _id: first }, { trashedAt: long });
      await purgeExpiredTrash();
      expect((await Suite.find()).map(suite => suite.slug)).toEqual(['borrowed']);

      await Project.updateOne({ _id: second }, { trashedAt: long });
      await purgeExpiredTrash();
      expect(await Suite.countDocuments()).toBe(0);
      expect(await Evaluation.countDocuments()).toBe(0);
    });

    it('purges an evaluation that has been in the trash for thirty days, with its results, and keeps newer ones', async () => {
      const id = await project();
      await publishSuite(id);
      const old = (await record(id, { uuid: 'old', results: { ...goodResults(), curve: [1, 2, 3] } })).body.data._id;
      const recent = (await record(id, { uuid: 'recent', checkpoint: local('B') })).body.data._id;
      const live = (await record(id, { uuid: 'live', checkpoint: local('C') })).body.data._id;
      await call(`/evaluations/${old}`, { method: 'DELETE' });
      await call(`/evaluations/${recent}`, { method: 'DELETE' });
      await Evaluation.updateOne({ _id: old }, { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) });

      expect(await purgeExpiredTrash()).toMatchObject({ evaluations: 1 });
      expect(await Evaluation.findById(old)).toBeNull();
      expect(await Evaluation.findById(recent)).not.toBeNull();
      expect(await Evaluation.findById(live)).not.toBeNull();
      expect((await call(`/evaluations/${recent}/restore`, { method: 'POST' })).status).toBe(200);
    });

    it('keeps a suite of a project that is still alive when the other project that used it is purged', async () => {
      const owner = await project();
      const borrower = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      await publishSuite(owner, { slug: 'mine', visibility: 'public' });
      await call('/evaluations', { method: 'POST', user: STRANGER, body: { projectId: borrower, uuid: 'b1', suite: 'mine@1', results: goodResults(), sampleCounts: counts, checkpoint: local('B'), evidence: evidenceFor() } });
      await Project.updateOne({ _id: borrower }, { trashedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) });
      await purgeExpiredTrash();
      expect((await Suite.find()).map(suite => suite.slug)).toEqual(['mine']);
    });
  });

  describe('leaderboards', () => {
    it('finds an eligible attempt older than 5,000 failures and pages ranked and unranked checkpoints independently', async () => {
      const id = await project();
      await publishSuite(id);
      const old = (await record(id, { uuid: 'old-good', results: goodResults(0.8, 0.8) })).body.data;
      const seed = (await Evaluation.findById(old._id).lean())!;
      await Evaluation.collection.insertMany(
        Array.from({ length: 5001 }, (_, index) => ({
          ...seed,
          _id: new mongoose.Types.ObjectId(),
          uuid: `failed-${index}`,
          status: 'failed',
          receivedAt: new Date(seed.receivedAt.getTime() + index + 1),
          validation: { version: 1, state: 'incomplete', reasons: [{ code: 'failed' }], warnings: [] }
        }))
      );
      await record(id, { uuid: 'other-good', checkpoint: local('B'), results: goodResults(0.5, 0.5) });
      await record(id, { uuid: 'bad-c', checkpoint: local('C'), status: 'failed', results: {} });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await record(id, { uuid: 'bad-d', checkpoint: local('D'), results: {} });
      const first = (await call('/suites/road-test/1/leaderboard?limit=1')).body.data;
      expect(first.scope).toEqual({ candidates: 5005, truncated: false });
      expect(first.entries).toMatchObject([{ rank: 1, uuid: 'old-good', attempts: 5002 }]);
      expect(first.unranked).toMatchObject([{ uuid: 'bad-d' }]);
      expect(first.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
      expect(first.unrankedPagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
      const second = (await call('/suites/road-test/1/leaderboard?limit=1&page=2&unrankedPage=2')).body.data;
      expect(second.entries).toMatchObject([{ rank: 2, uuid: 'other-good' }]);
      expect(second.unranked).toMatchObject([{ uuid: 'bad-c' }]);
      expect((await call('/suites/road-test/1/leaderboard?unrankedPage=0')).status).toBe(400);
      expect((await call('/suites/road-test/1/leaderboard?limit=101')).status).toBe(400);
    });

    it('ranks over the pool the caller can read, and says how big that pool is', async () => {
      const home = await project({ visibility: 'public' });
      const away = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
      await publishSuite(home, { visibility: 'public' });
      const first = await record(home, { uuid: 'a', checkpoint: local('A'), results: goodResults(0.9, 0.9) });
      await record(home, { uuid: 'hidden', checkpoint: local('H'), results: goodResults(0.1, 0.1) });
      await call(`/evaluations/${first.body.data._id}/publish`, { method: 'POST' });
      await call('/evaluations', { method: 'POST', user: STRANGER, body: { projectId: away, uuid: 'b', suite: 'road-test@1', checkpoint: local('B'), results: goodResults(0.5, 0.5), sampleCounts: counts, evidence: evidenceFor() } });
      // The stranger holds their own project in full, and reads only what was published in the public one.
      const asStranger = (await call('/suites/road-test/1/leaderboard', { user: STRANGER })).body.data;
      expect(asStranger.scope).toEqual({ candidates: 2, truncated: false });
      expect(asStranger.entries.map((entry: { uuid: string; rank: number }) => [entry.uuid, entry.rank])).toEqual([['a', 1], ['b', 2]]);
      const asAnonymous = (await call('/suites/road-test/1/leaderboard', { user: ANONYMOUS })).body.data;
      expect(asAnonymous.scope.candidates).toBe(1);
      expect(asAnonymous.entries.map((entry: { uuid: string; rank: number }) => [entry.uuid, entry.rank])).toEqual([['a', 1]]);
    });

    it('answers latest, and not found for a suite that is hidden or absent', async () => {
      const id = await project();
      await publishSuite(id);
      expect((await call('/suites/road-test/latest/leaderboard')).status).toBe(200);
      expect((await call('/suites/road-test/1/leaderboard', { user: STRANGER })).status).toBe(404);
      expect((await call('/suites/nope/1/leaderboard')).status).toBe(404);
    });
  });
});
