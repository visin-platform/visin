import { vi } from 'vitest';
const { membership } = vi.hoisted(() => {
  const membership = vi.fn();
  return { membership };
});
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
import Training from '../../models/Training';
import RunSample from '../../models/RunSample';
import RunSampleBatch from '../../models/RunSampleBatch';
import { recoverSampleBatches } from '../../services/runSampleService';
import { scoreSampleRun } from '../../services/sampleScoring';
import { sampleDigest } from '../../services/sampleDigest';
import { suiteProtocolSchema } from '../../validation/suiteSchemas';
import suiteRoutes from '../../routes/suiteRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import { purgeExpiredTrash, purgeProject } from '../../services/purgeService';

vi.mock('../../clients/projectGroupsClient', async () => {
  const module = await (() => ({ getUserGroups: vi.fn() }))();
  return Object.assign({ default: module }, module);
});

vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    recordResourceEvent: vi.fn(),
    createGroupServiceClient: () => ({
      checkMembership: membership,
      getMyGroups: vi.fn(async function () {
        return [];
      })
    })
  }))();
  return Object.assign({ default: module }, module);
});

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
  conditions: [
    { name: 'day', sampleCount: 120 },
    { name: 'night', sampleCount: 100 }
  ],
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
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Suite.init();
    await SuiteSlug.init();
    await RunSample.init();
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/suites', suiteRoutes);
    app.use('/trainings', trainingRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    vi.mocked(recordResourceEvent).mockClear();
    const ids = [OWNER, ADMIN, MEMBER, STRANGER].map((id) => new mongoose.Types.ObjectId(id));
    await mongoose.connection
      .collection('users')
      .insertMany(ids.map((_id) => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection
      .collection('user_sessions')
      .insertMany(ids.map((_id) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    vi.mocked(getUserGroups).mockImplementation(async function (userId) {
      return ROLES[userId ?? ''] ?? [];
    });
    membership.mockImplementation(async function (_group: string, userId: string) {
      const role = ROLES[userId]?.[0]?.role;
      return role ? { member: true, role } : { member: false, role: null };
    });
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  // oxlint-disable-next-line typescript/no-explicit-any
  type Body = { data: any; message?: string };
  const call = async (
    path: string,
    { method = 'GET', user = OWNER, body }: { method?: string; user?: string; body?: unknown } = {}
  ) => {
    const unsigned = [
      { alg: 'HS256', typ: 'JWT' },
      {
        id: user,
        email: `${user}@example.test`,
        tokenVersion: 1,
        sid: user,
        typ: 'session',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60
      }
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
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
    String(
      (
        await Project.create({
          name: 'Team project',
          slug: `team-${new mongoose.Types.ObjectId()}`,
          owner: { kind: 'group', id: GROUP },
          createdBy: OWNER,
          ...fields
        })
      )._id
    );
  const publish = (projectId: string, overrides: Record<string, unknown> = {}, user = OWNER) =>
    call('/suites', {
      method: 'POST',
      user,
      body: { slug: 'road-test', version: 1, name: 'Road test', projectId, protocol: protocol(), ...overrides }
    });

  it('accepts idempotent sample batches, scopes reads and prevents writes after completion', async () => {
    const projectId = await project({ visibility: 'private' });
    const created = await publish(projectId, { protocol: protocol({ task: 'vlm-judge', classes: [{ id: 'pedestrian' }], samples: { attrs: [{ key: 'class', values: ['pedestrian'] }, { key: 'size' }, { key: 'pixels' }], fields: [{ key: 'verdict', values: ['valid', 'invalid'] }], weight: 'pixels' } }) });
    const suite = created.body.data;
    const run = await Training.create({ uuid: 'judge-1', name: 'Judge', projectId, ownerId: OWNER, kind: 'inference', status: 'running', suite: { slug: suite.slug, version: suite.version, digest: suite.digest } });
    const path = `/trainings/${run._id}/samples`;
    const sample = { id: 'frame_1/m1', attrs: { class: 'pedestrian', size: 'day', pixels: 212 }, fields: { verdict: 'valid' } };
    await Training.updateOne({ _id: run._id }, { $set: { status: 'stalled' }, $unset: { lastSeenAt: 1 } });
    expect((await call(path, { method: 'POST', body: { samples: [sample] } })).status).toBe(200);
    // A sample write is a sign of life, and a sealed batch leaves no second copy of its rows behind.
    const touched = await Training.findById(run._id);
    expect(touched?.lastSeenAt).toBeInstanceOf(Date);
    expect(touched?.status).toBe('running');
    expect(await RunSampleBatch.countDocuments({ trainingId: String(run._id) })).toBe(0);
    expect((await call(path, { method: 'POST', body: { samples: [sample] } })).status).toBe(200);
    expect(await RunSampleBatch.countDocuments({ trainingId: String(run._id) })).toBe(0);
    expect((await call(path, { method: 'POST', body: { samples: [{ ...sample, fields: { verdict: 'invalid' } }] } })).status).toBe(409);
    expect((await call(path, { method: 'POST', body: { samples: [{ ...sample, fields: { verdict: 'typo' } }] } })).status).toBe(400);
    const race = await Promise.all(['valid', 'invalid'].map(verdict => call(path, { method: 'POST', body: { samples: [{ ...sample, id: 'frame_1/m2', fields: { verdict } }] } })));
    expect(race.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await call(path, { user: STRANGER })).status).toBe(404);
    expect((await call('/trainings/not-an-id/samples')).status).toBe(404);
    expect((await call(`${path}?attrs=not-json`)).status).toBe(400);
    expect((await call(`${path}?fields=${encodeURIComponent(JSON.stringify({ '$where': 'bad' }))}`)).status).toBe(400);
    expect((await call(`${path}?attrs=${encodeURIComponent('[]')}`)).status).toBe(400);
    expect((await call(`${path}?fields=${encodeURIComponent(JSON.stringify({ verdict: 'invalid' }))}`)).status).toBe(200);
    const filtered = await call(`${path}?attrs=${encodeURIComponent(JSON.stringify({ class: 'pedestrian' }))}`);
    expect(filtered.body.data.pagination.total).toBe(2);
    expect(filtered.body.data.samples[0].id).toBe('frame_1/m1');
    await Training.updateOne({ _id: run._id }, { $set: { pendingSampleBatches: ['pending'] } });
    expect((await call(`/trainings/${run._id}`, { method: 'PUT', body: { status: 'completed' } })).status).toBe(409);
    await Training.updateOne({ _id: run._id }, { $unset: { pendingSampleBatches: 1 } });
    expect((await call(`/trainings/${run._id}`, { method: 'PUT', body: { status: 'completed' } })).status).toBe(200);
    expect((await call(path, { method: 'POST', body: { samples: [sample] } })).status).toBe(409);
    expect((await call(`/trainings/${run._id}`, { method: 'PUT', body: { status: 'running' } })).status).toBe(409);
  });

  it('refuses a sample without a known class and condition before the run can be sealed', async () => {
    const projectId = await project();
    const created = await publish(projectId, { protocol: protocol({ classes: [{ id: 'a' }], samples: { attrs: [{ key: 'class' }, { key: 'size' }], fields: [{ key: 'verdict', values: ['valid'] }] } }) });
    expect(created.status).toBe(201);
    const suite = created.body.data;
    const run = await Training.create({ uuid: 'unscorable', name: 'Judge', projectId, ownerId: OWNER, kind: 'inference', status: 'running', suite: { slug: suite.slug, version: suite.version, digest: suite.digest } });
    const path = `/trainings/${run._id}/samples`;
    const missing = await call(path, { method: 'POST', body: { samples: [{ id: 'one', attrs: { class: 'a' }, fields: { verdict: 'valid' } }] } });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toContain('Missing attribute: size');
    const unknown = await call(path, { method: 'POST', body: { samples: [{ id: 'one', attrs: { class: 'b', size: 'day' }, fields: { verdict: 'valid' } }] } });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toContain('Attribute class');
    expect(await RunSample.countDocuments({ trainingId: String(run._id) })).toBe(0);
    const unscorable = await publish(projectId, { version: 2, protocol: protocol({ samples: { attrs: [], fields: [{ key: 'verdict', values: ['valid'] }] } }) });
    expect(unscorable.status).toBe(400);
  });

  it('counts the inference runs of a project among its totals, so its page can tell a judge project from a training one', async () => {
    const projectId = await project();
    await Training.create({ uuid: 'trained', name: 'Training', projectId, ownerId: OWNER });
    await Training.create({ uuid: 'judged', name: 'Judge', projectId, ownerId: OWNER, kind: 'inference' });
    const stats = (await call(`/trainings/stats?projectId=${projectId}`)).body.data;
    expect(stats).toMatchObject({ totalTrainings: 2, inferenceTrainings: 1 });
  });

  it('refuses sample writes on a run without a pinned sample suite', async () => {
    const projectId = await project();
    const run = await Training.create({ uuid: 'ordinary', name: 'Training', projectId, ownerId: OWNER });
    const sample = { id: 'one', attrs: {}, fields: { verdict: 'valid' } };
    expect((await call(`/trainings/${run._id}/samples`, { method: 'POST', body: { samples: [sample] } })).status).toBe(400);
    const broken = await Training.create({ uuid: 'broken', name: 'Broken', projectId, ownerId: OWNER, kind: 'inference', suite: { slug: 'missing', version: 1, digest: 'a'.repeat(64) } });
    expect((await call(`/trainings/${broken._id}/samples`, { method: 'POST', body: { samples: [sample] } })).status).toBe(400);
  });

  it('recovers a batch left reserved by an interrupted service', async () => {
    const projectId = await project();
    const run = await Training.create({ uuid: 'recover', name: 'Judge', projectId, ownerId: OWNER, kind: 'inference', pendingSampleBatches: ['batch'] });
    const row = { id: 'frame/m1', attrs: { pixels: 3 }, fields: { verdict: 'valid' } };
    await RunSampleBatch.create({ _id: 'batch', trainingId: String(run._id), projectId, samples: [row] });
    await recoverSampleBatches();
    expect(await RunSample.countDocuments({ trainingId: String(run._id), sampleId: row.id })).toBe(1);
    const recovered = await Training.findById(run._id).select('+pendingSampleBatches');
    expect(recovered?.pendingSampleBatches).toEqual([]);
    await recoverSampleBatches();
    expect(await RunSample.countDocuments({ trainingId: String(run._id) })).toBe(1);
  });

  it('replays the actual reserved batch after an interrupted insert', async () => {
    const projectId = await project();
    const created = await publish(projectId, { protocol: protocol({ classes: [{ id: 'a' }], samples: { attrs: [{ key: 'class' }, { key: 'size' }], fields: [{ key: 'verdict', values: ['valid'] }] } }) });
    const suite = created.body.data;
    const run = await Training.create({ uuid: 'interrupt', name: 'Judge', projectId, ownerId: OWNER, kind: 'inference', suite: { slug: suite.slug, version: suite.version, digest: suite.digest } });
    const insert = vi.spyOn(RunSample, 'bulkWrite').mockRejectedValueOnce(new Error('injected write failure'));
    const row = { id: 'one', attrs: { class: 'a', size: 'day' }, fields: { verdict: 'valid' } };
    expect((await call(`/trainings/${run._id}/samples`, { method: 'POST', body: { samples: [row] } })).status).toBe(500);
    insert.mockRestore();
    expect((await Training.findById(run._id).select('+pendingSampleBatches'))?.pendingSampleBatches).toHaveLength(1);
    await recoverSampleBatches();
    expect(await RunSample.countDocuments({ trainingId: String(run._id) })).toBe(1);
    expect((await call(`/trainings/${run._id}`, { method: 'PUT', body: { status: 'completed' } })).status).toBe(200);
    expect(await RunSampleBatch.countDocuments({ trainingId: String(run._id) })).toBe(0);
  });

  it('does not reserve a batch when durable payload storage fails', async () => {
    const projectId = await project();
    const created = await publish(projectId, { protocol: protocol({ classes: [{ id: 'a' }], samples: { attrs: [{ key: 'class' }, { key: 'size' }], fields: [{ key: 'verdict', values: ['valid'] }] } }) });
    const suite = created.body.data;
    const run = await Training.create({ uuid: 'batch-store-failure', name: 'Judge', projectId, ownerId: OWNER, kind: 'inference', suite: { slug: suite.slug, version: suite.version, digest: suite.digest } });
    const save = vi.spyOn(RunSampleBatch, 'updateOne').mockRejectedValueOnce(new Error('storage failed'));
    expect((await call(`/trainings/${run._id}/samples`, { method: 'POST', body: { samples: [{ id: 'one', attrs: { class: 'a', size: 'day' }, fields: { verdict: 'valid' } }] } })).status).toBe(500);
    save.mockRestore();
    expect((await Training.findById(run._id).select('+pendingSampleBatches'))?.pendingSampleBatches ?? []).toHaveLength(0);
  });

  it('releases a reservation whose payload was already sealed, and keeps a temporarily failing one', async () => {
    const projectId = await project();
    const run = await Training.create({ uuid: 'missing-batch', name: 'Judge', projectId, ownerId: OWNER, kind: 'inference', pendingSampleBatches: ['missing'] });
    // Payloads are deleted only once every row is stored, so a reservation without one would otherwise block completion.
    await recoverSampleBatches();
    expect((await Training.findById(run._id).select('+pendingSampleBatches'))?.pendingSampleBatches).toEqual([]);
    // A payload that names another run is never written to this one, and stays reserved for someone to look at.
    await Training.updateOne({ _id: run._id }, { $set: { pendingSampleBatches: ['foreign'] } });
    await RunSampleBatch.create({ _id: 'foreign', trainingId: 'another-run', projectId, samples: [{ id: 'one', attrs: {}, fields: {} }] });
    await recoverSampleBatches();
    expect((await Training.findById(run._id).select('+pendingSampleBatches'))?.pendingSampleBatches).toEqual(['foreign']);
    expect(await RunSample.countDocuments({ trainingId: String(run._id) })).toBe(0);
    await Training.updateOne({ _id: run._id }, { $set: { pendingSampleBatches: ['missing'] } });
    await RunSampleBatch.create({ _id: 'missing', trainingId: String(run._id), projectId, samples: [{ id: 'one', attrs: {}, fields: {} }] });
    const insert = vi.spyOn(RunSample, 'bulkWrite').mockRejectedValueOnce(new Error('temporary failure'));
    await recoverSampleBatches();
    insert.mockRestore();
    expect((await Training.findById(run._id).select('+pendingSampleBatches'))?.pendingSampleBatches).toEqual(['missing']);
  });

  it('scores grouped sample shares and reference errors using their proper denominators', async () => {
    const projectId = await project();
    const proto = suiteProtocolSchema.parse(protocol({
      conditions: [{ name: 'small', sampleCount: 3 }], classes: [{ id: 'a' }, { id: 'b' }],
      samples: { attrs: [{ key: 'size' }, { key: 'class' }], fields: [{ key: 'outcome', values: ['keep', 'delete'], accept: ['keep'] }] },
      reference: { samplesDigest: 'a'.repeat(64) },
      metrics: [
        { key: 'reject', direction: 'min', headline: true, derivation: 'share:outcome=delete' },
        { key: 'error', direction: 'min', derivation: 'error:outcome' },
        { key: 'fa', direction: 'min', derivation: 'fa:outcome' },
        { key: 'fr', direction: 'min', derivation: 'fr:outcome' },
        { key: 'latency', direction: 'min', derivation: 'latency:mean' }
      ]
    }));
    for (const [sampleId, classId, actual, reference, latencyMs] of [
      ['1', 'a', 'keep', 'delete', 10], ['2', 'a', 'delete', 'keep', 20], ['3', 'b', 'keep', 'keep', 30]
    ] as const) {
      const attrs = { size: 'small', class: classId };
      await RunSample.create({ trainingId: 'model', projectId, sampleId, attrs, fields: { outcome: actual }, latencyMs });
      await RunSample.create({ trainingId: 'reference', projectId, sampleId, attrs, fields: { outcome: reference } });
    }
    const scored = await scoreSampleRun('model', proto, 'reference');
    expect(scored.sampleCounts).toEqual({ small: 3 });
    expect(scored.results.small.overall).toEqual({ reject: 1 / 3, error: 2 / 3, fa: 1, fr: 0.5, latency: 20 });
    expect(scored.results.small.a).toEqual({ reject: 0.5, error: 1, fa: 1, fr: 1, latency: 15 });
    expect(scored.results.small.b).toEqual({ reject: 0, error: 0, fr: 0, latency: 30 });
    const digest = await sampleDigest('model');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    await RunSample.updateOne({ trainingId: 'model', sampleId: '1' }, { $set: { raw: 'changed' } });
    expect(await sampleDigest('model')).not.toBe(digest);
    const percent = suiteProtocolSchema.parse({ ...proto, metrics: [{ key: 'reject', direction: 'min', headline: true, derivation: 'share:outcome=delete', unit: '%' }] });
    expect((await scoreSampleRun('model', percent)).results.small.overall.reject).toBeCloseTo(100 / 3);
    await RunSample.updateOne({ trainingId: 'reference', sampleId: '1' }, { $set: { 'attrs.class': 'b' } });
    await expect(scoreSampleRun('model', proto, 'reference')).rejects.toThrow('Reference and run attributes differ');
    await expect(scoreSampleRun('model', proto)).rejects.toThrow('reference run is required');
    const incomplete = suiteProtocolSchema.parse(protocol({ metrics: [{ key: 'm', direction: 'max', headline: true }], samples: { attrs: [{ key: 'size' }, { key: 'class' }], fields: [{ key: 'outcome', values: ['keep'] }] } }));
    await expect(scoreSampleRun('model', incomplete)).rejects.toThrow('Every sample-suite metric');
    await RunSample.create({ trainingId: 'bad-model', projectId, sampleId: 'bad', attrs: {}, fields: { outcome: 'keep' } });
    await expect(scoreSampleRun('bad-model', proto, 'reference')).rejects.toThrow('Sample class or condition');
    const literal = suiteProtocolSchema.parse({ ...proto, samples: { ...proto.samples, fields: [{ key: 'outcome', values: ['$keep', 'delete'], accept: ['$keep'] }] }, metrics: [{ key: 'share', direction: 'max', headline: true, derivation: 'share:outcome=$keep' }] });
    await RunSample.create({ trainingId: 'literal', projectId, sampleId: '1', attrs: { size: 'small', class: 'a' }, fields: { outcome: '$keep' } });
    expect((await scoreSampleRun('literal', literal)).results.small.overall.share).toBe(1);
  });

  it('keeps filtered sample metric populations separate without changing total counts', async () => {
    const projectId = await project();
    const proto = suiteProtocolSchema.parse(protocol({
      conditions: [{ name: 'small', sampleCount: 3 }], classes: [{ id: 'a' }],
      samples: { attrs: [{ key: 'size' }, { key: 'class' }, { key: 'role', values: ['classify', 'confirm'] }], fields: [{ key: 'outcome', values: ['keep', 'delete'], accept: ['keep'] }] },
      reference: { samplesDigest: 'a'.repeat(64) },
      metrics: [
        { key: 'mask_reject', direction: 'min', headline: true, derivation: 'share:outcome=delete', filter: { role: 'classify' } },
        { key: 'candidate_reject', direction: 'min', derivation: 'share:outcome=delete', filter: { role: 'confirm' } },
        { key: 'mask_error', direction: 'min', derivation: 'error:outcome', filter: { role: 'classify' } },
        { key: 'mask_latency', direction: 'min', derivation: 'latency:mean', filter: { role: 'classify' } }
      ]
    }));
    for (const [sampleId, role, actual, reference, latencyMs] of [
      ['1', 'classify', 'keep', 'delete', 10], ['2', 'classify', 'delete', 'delete', 20], ['3', 'confirm', 'delete', 'keep', 90]
    ] as const) {
      const attrs = { size: 'small', class: 'a', role };
      await RunSample.create({ trainingId: 'filtered', projectId, sampleId, attrs, fields: { outcome: actual }, latencyMs });
      await RunSample.create({ trainingId: 'filtered-ref', projectId, sampleId, attrs, fields: { outcome: reference } });
    }
    const result = await scoreSampleRun('filtered', proto, 'filtered-ref');
    expect(result.sampleCounts).toEqual({ small: 3 });
    expect(result.results.small.overall).toEqual({ mask_reject: 0.5, candidate_reject: 1, mask_error: 0.5, mask_latency: 15 });
  });

  it('counts missing predictions only when a metric explicitly gives them a value', async () => {
    const projectId = await project();
    const proto = suiteProtocolSchema.parse(protocol({
      conditions: [{ name: 'small', sampleCount: 2 }], classes: [{ id: 'a' }],
      samples: { attrs: [{ key: 'size' }, { key: 'class' }], fields: [{ key: 'verdict', values: ['valid', 'invalid'], accept: ['valid'] }] },
      reference: { samplesDigest: 'a'.repeat(64) },
      metrics: [
        { key: 'fr_default', direction: 'min', headline: true, derivation: 'fr:verdict', missingValue: 'invalid' },
        { key: 'fr_observed', direction: 'min', derivation: 'fr:verdict' }
      ]
    }));
    for (const [sampleId, fields] of [['1', {}], ['2', { verdict: 'valid' }]] as const) {
      const attrs = { size: 'small', class: 'a' };
      await RunSample.create({ trainingId: 'missing-pred', projectId, sampleId, attrs, fields });
      await RunSample.create({ trainingId: 'missing-ref', projectId, sampleId, attrs, fields: { verdict: 'valid' } });
    }
    const result = await scoreSampleRun('missing-pred', proto, 'missing-ref');
    expect(result.results.small.overall).toEqual({ fr_default: 0.5, fr_observed: 0 });
  });

  describe('publishing', () => {
    it('stores the protocol with its digest and reads it back by number and as latest', async () => {
      const id = await project();
      const created = await publish(id);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        slug: 'road-test',
        version: 1,
        projectId: id,
        visibility: 'private',
        createdBy: OWNER
      });
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
      const reordered = await publish(id, {
        protocol: protocol({
          conditions: [
            { name: 'night', sampleCount: 100 },
            { name: 'day', sampleCount: 120 }
          ]
        })
      });
      expect(reordered.status).toBe(200);
    });

    it('lets one of two simultaneous publishes win and answers the other from the stored suite', async () => {
      const id = await project();
      const same = await Promise.all([publish(id), publish(id)]);
      expect(same.map((result) => result.status).sort()).toEqual([200, 201]);
      expect(await Suite.countDocuments()).toBe(1);

      const rival = await Promise.all([
        publish(id, { version: 2 }),
        publish(id, { version: 2, protocol: protocol({ split: 'val' }) })
      ]);
      expect(rival.map((result) => result.status).sort()).toEqual([201, 409]);
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
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Both requests have checked the empty version collection before either can claim the name.
      const claim = vi.spyOn(SuiteSlug, 'create').mockImplementation((async (doc: {
        _id: string;
        projectId: string;
      }) => {
        if (++arrivals === 2) release();
        await gate;
        return create(doc);
      }) as typeof SuiteSlug.create);
      try {
        const results = await Promise.all([publish(first), publish(second, { version: 2 }, STRANGER)]);
        expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
        const winner = await Suite.findOne().orFail();
        expect(await Suite.distinct('projectId')).toEqual([winner.projectId]);
        expect((await SuiteSlug.findById('road-test'))?.projectId).toBe(winner.projectId);
      } finally {
        claim.mockRestore();
      }
    });

    it('allows concurrent different versions within the same project', async () => {
      const id = await project();
      const results = await Promise.all([1, 2, 3, 4].map((version) => publish(id, { version })));
      expect(results.map((result) => result.status)).toEqual([201, 201, 201, 201]);
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
      await expect(purgeProject(await Project.findById(first).orFail())).rejects.toThrow(
        'conflicting historical ownership'
      );
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
      const insert = vi.spyOn(Suite, 'create').mockRejectedValueOnce(new Error('temporary insert failure'));
      try {
        expect((await publish(id, { visibility: 'public' })).status).toBe(500);
      } finally {
        insert.mockRestore();
      }
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
      expect((await publish(id, { version: 2, protocol: protocol({ split: 'val' }) })).body.data.visibility).toBe(
        'public'
      );
      expect(
        (await publish(id, { version: 3, visibility: 'private', protocol: protocol({ split: 'x' }) })).body.data
          .visibility
      ).toBe('private');
    });

    it.each(['private', 'public'])(
      'requires manage to create a public protocol in a %s project, but accepts private contributor protocols',
      async (visibility) => {
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
      }
    );

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
      expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
      expect(recordResourceEvent).toHaveBeenCalledTimes(1);
      expect(recordResourceEvent).toHaveBeenCalledWith({
        service: 'vision-service',
        resourceType: 'suite',
        resourceId: responses[0].body.data._id,
        resourceName: 'road-test@1',
        action: 'visibility',
        actorId: ADMIN,
        owner: expect.objectContaining({ kind: 'group', id: GROUP }),
        visibility: 'public'
      });

      const retry = await publish(id, { visibility: 'private', name: 'ignored' }, MEMBER);
      expect(retry.status).toBe(200);
      expect(retry.body.data).toMatchObject({
        _id: responses[0].body.data._id,
        name: 'Road test',
        visibility: 'public'
      });
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
      for (const bad of [
        protocol({ conditions: [] }),
        protocol({ notes: 'x' }),
        { ...protocol(), data: { kind: 'hf', repo: 'a/b', commit: 'main' } }
      ]) {
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
      expect(
        (await call('/suites/road-test/1', { method: 'PATCH', user: STRANGER, body: { name: 'mine' } })).status
      ).toBe(403);
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
      expect(
        all.body.data.suites.map((suite: { slug: string; version: number }) => `${suite.slug}@${suite.version}`)
      ).toEqual(['depth@1', 'road-test@2', 'road-test@1']);
      expect(
        (await call('/suites?order=asc')).body.data.suites.map((suite: { version: number }) => suite.version)
      ).toEqual([1, 1, 2]);
      expect((await call('/suites?slug=road-test')).body.data.suites).toHaveLength(2);
      expect((await call(`/suites?projectId=${b}`)).body.data.suites).toHaveLength(1);
      expect((await call('/suites?projectId=nowhere')).body.data.suites).toEqual([]);
      const paged = await call('/suites?limit=2&page=2');
      expect(paged.body.data.suites).toHaveLength(1);
      expect(paged.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });
    });
  });

  describe('changing a suite', () => {
    it("lets a contributor reword their own, but sharing and others' suites need manage", async () => {
      const id = await project();
      await publish(id, {}, MEMBER);
      const renamed = await call('/suites/road-test/1', {
        method: 'PATCH',
        user: MEMBER,
        body: { name: 'Road test (day/night)', description: 'Two conditions' }
      });
      expect(renamed.body.data).toMatchObject({ name: 'Road test (day/night)', description: 'Two conditions' });
      expect(
        (await call('/suites/road-test/1', { method: 'PATCH', user: MEMBER, body: { visibility: 'public' } })).status
      ).toBe(403);

      await publish(id, { slug: 'by-owner' }, OWNER);
      expect(
        (await call('/suites/by-owner/1', { method: 'PATCH', user: MEMBER, body: { name: 'taken over' } })).status
      ).toBe(403);
      expect(
        (
          await call('/suites/by-owner/1', {
            method: 'PATCH',
            user: ADMIN,
            body: { visibility: 'public', description: null }
          })
        ).body.data.visibility
      ).toBe('public');
      expect((await call('/suites/by-owner/1', { method: 'PATCH', user: STRANGER, body: { name: 'x' } })).status).toBe(
        403
      );
    });

    it('never changes the protocol, and refuses an empty change', async () => {
      const id = await project();
      const created = await publish(id);
      const attempt = await call('/suites/road-test/1', {
        method: 'PATCH',
        body: { protocol: protocol({ split: 'val' }) }
      });
      expect(attempt.status).toBe(400);
      await call('/suites/road-test/1', { method: 'PATCH', body: { name: 'Reworded' } });
      const stored = (await call('/suites/road-test/1')).body.data;
      expect(stored.digest).toBe(created.body.data.digest);
      expect(stored.protocol.split).toBe('test');
    });

    describe('what the publisher says about the evaluated data', () => {
      const terms = {
        license: { id: 'cc-by-nc-4.0' },
        sourceUrl: 'https://data.example.test/roads',
        credit: 'Road Lab, 2025'
      };
      const patch = (body: unknown, user = OWNER) => call('/suites/road-test/1', { method: 'PATCH', user, body });

      it('is unstated unless given, and shown with the licence’s name and link from the table', async () => {
        const id = await project();
        expect((await publish(id)).body.data).not.toHaveProperty('dataTerms');
        await Suite.deleteMany({});
        const created = await publish(id, { dataTerms: terms });
        expect(created.body.data.dataTerms).toEqual({
          license: {
            id: 'cc-by-nc-4.0',
            name: 'CC BY-NC 4.0',
            url: 'https://creativecommons.org/licenses/by-nc/4.0/',
            commercial: false
          },
          sourceUrl: 'https://data.example.test/roads',
          credit: 'Road Lab, 2025'
        });
        expect((await Suite.findOne({ slug: 'road-test' }).lean())?.dataTerms?.license).toEqual({ id: 'cc-by-nc-4.0' });
      });

      it('is not part of the protocol, so correcting it leaves the digest and the version alone', async () => {
        const id = await project();
        const created = await publish(id, { dataTerms: terms });
        const corrected = await patch({
          dataTerms: { license: { id: 'other', name: 'Road Lab terms', url: 'https://roadlab.test/terms' } }
        });
        expect(corrected.body.data.dataTerms).toEqual({
          license: { id: 'other', name: 'Road Lab terms', url: 'https://roadlab.test/terms' }
        });
        expect(corrected.body.data.digest).toBe(created.body.data.digest);
        expect((await patch({ dataTerms: null })).body.data).not.toHaveProperty('dataTerms');
        // A retried publish of the same protocol is harmless and says nothing new about the data.
        expect((await publish(id, { dataTerms: terms })).body.data).not.toHaveProperty('dataTerms');
      });

      it('is not inherited by a later version, whose data may be another', async () => {
        const id = await project();
        await publish(id, { dataTerms: terms });
        const next = await publish(id, { version: 2, protocol: protocol({ split: 'val' }) });
        expect(next.status).toBe(201);
        expect(next.body.data).not.toHaveProperty('dataTerms');
      });

      it('may be changed by whoever may reword the suite, and by no one else', async () => {
        const id = await project();
        await publish(id, {}, MEMBER);
        expect((await patch({ dataTerms: terms }, MEMBER)).status).toBe(200);
        // A private suite is not confirmed to a stranger.
        expect((await patch({ dataTerms: terms }, STRANGER)).status).toBe(404);
      });

      it('refuses what is not a declaration', async () => {
        const id = await project();
        await publish(id);
        for (const dataTerms of [
          {},
          { license: { id: 'not-listed' } },
          { license: { id: 'other' } },
          { sourceUrl: 'javascript:alert(1)' },
          { sourceUrl: 'https://user:pw@data.example.test/' },
          { credit: '' },
          { note: 'extra' }
        ]) {
          expect((await patch({ dataTerms })).status).toBe(400);
          expect((await publish(id, { slug: 'other-suite', dataTerms })).status).toBe(400);
        }
      });
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
      expect(
        (await call('/suites/road-test/2', { method: 'PATCH', body: { archived: false } })).body.data.archivedAt
      ).toBeUndefined();
      expect((await call('/suites/road-test/latest')).body.data.version).toBe(2);
    });

    it('needs a login, and a concrete version', async () => {
      const id = await project();
      await publish(id);
      expect(
        (await call('/suites/road-test/1', { method: 'PATCH', user: ANONYMOUS, body: { name: 'x' } })).status
      ).toBe(401);
      expect((await call('/suites/road-test/latest', { method: 'PATCH', body: { name: 'x' } })).status).toBe(400);
      expect((await call('/suites/road-test/9', { method: 'PATCH', body: { name: 'x' } })).status).toBe(404);
    });
  });
});
