import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { fetchWithTimeout, createApiKey, errorHandler, resetEncryptionKeyCache } from '@visin/backend-core';
import { API_ROUTE_GROUPS } from '../../routes/apiRoutes';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import { stallSilentTrainings } from '../../services/trainingHeartbeatService';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import Evaluation from '../../models/Evaluation';
import { verifyEvaluation } from '../../services/recordedLeaderboardService';
import { projectTokenContext } from '../../middleware/projectTokenContext';
import { recordTests } from '../fixtures/recordedTest';
import Benchmark from '../../models/Benchmark';
import Config from '../../models/Config';
import UploadReservation from '../../models/UploadReservation';

jest.mock('@visin/backend-core', () => ({ ...jest.requireActual('@visin/backend-core'), fetchWithTimeout: jest.fn() }));

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn(async () => []) }));
jest.mock('../../clients/fileServiceClient', () => ({
  getUploadSignedUrl: jest.fn(async () => 'https://files.example.test/upload'),
  getFileMetadata: jest.fn(async () => ({ size: 1 })),
  getSignedUrl: jest.fn(async () => ({ signedUrl: 'https://files.example.test/read' }))
}));

const OWNER = '000000000000000000000001';
let mongo: MongoMemoryServer;
let server: Server;
let base: string;
let token: string;
let projectId: string;
let trainingId: string;
const saved = { encryption: process.env.API_KEY_ENCRYPTION_SECRET, jwt: process.env.JWT_SECRET };

beforeAll(async () => {
  process.env.API_KEY_ENCRYPTION_SECRET = 'todo-bugs-encryption';
  process.env.JWT_SECRET = 'todo-bugs-jwt';
  resetEncryptionKeyCache();
  mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Epoch.syncIndexes(), Benchmark.syncIndexes(), Config.syncIndexes(), UploadReservation.syncIndexes()]);
  const app = express();
  app.use(express.json(), identityContextMiddleware);
  for (const { path, guards, router } of API_ROUTE_GROUPS) app.use(path, ...guards, router);
  app.use(errorHandler);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

beforeEach(async () => {
  await mongoose.connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(OWNER), email: 'owner@example.test' });
  const project = await Project.create({ name: 'Project', slug: 'todo-project', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, visibility: 'public', stallAfterMinutes: 5 });
  projectId = project._id.toString();
  const key = await createApiKey({ userId: OWNER, userEmail: 'owner@example.test', userName: 'Owner', name: 'pipeline', scopes: ['vision:read', 'vision:write'], project: { id: projectId, name: 'Project' } });
  token = key.token;
  trainingId = (await Training.create({ uuid: 'run', name: 'Run', ownerId: OWNER, projectId, status: 'running', lastSeenAt: new Date() }))._id.toString();
  await Epoch.create({ trainingId, training_uuid: 'run', epoch_uuid: 'epoch', epoch: 1, timestamp: new Date(), results: {} });
});
afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
afterAll(async () => {
  if (saved.encryption === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
  else process.env.API_KEY_ENCRYPTION_SECRET = saved.encryption;
  if (saved.jwt === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = saved.jwt;
  resetEncryptionKeyCache();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});

const call = async (method: string, path: string, body?: unknown, auth = token) => {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() as { data: Record<string, unknown>; existing?: string[] } };
};

it('counts live run evaluations on the dashboard with the same visibility as the results list', async () => {
  await recordTests([
    { projectId, trainingId, test_uuid: 'run-test', epoch_uuid: 'epoch' },
    { projectId, trainingId, test_uuid: 'private-suite', suite: { id: 's', slug: 's', version: 1, digest: 'd' } },
    { projectId, trainingId, test_uuid: 'published-suite', suite: { id: 's', slug: 's', version: 1, digest: 'd' } },
    { projectId, trainingId, test_uuid: 'trashed', deletedAt: new Date() },
    { projectId: 'other', trainingId, test_uuid: 'other-project' },
    { projectId, trainingId: 'other-run', test_uuid: 'other-run' }
  ]);
  await Evaluation.updateOne({ uuid: 'published-suite' }, { publishedAt: new Date() });
  // The legacy collection is empty: counts must come entirely from evaluations.
  expect((await call('GET', `/projects/${projectId}/dashboard-stats`)).body.data.testResultsCount).toBe(3);
  expect((await call('GET', `/projects/${projectId}/dashboard-stats`, undefined, '')).body.data.testResultsCount).toBe(2);
  await Training.updateOne({ _id: trainingId }, { deletedAt: new Date() });
  expect((await call('GET', `/projects/${projectId}/dashboard-stats`)).body.data.testResultsCount).toBe(0);
});

it('does not enrich an evaluation with an epoch from another project or run', async () => {
  const otherProject = await Project.create({ name: 'Private', owner: { kind: 'user', id: 'other-owner' }, createdBy: 'other-owner' });
  const otherRun = await Training.create({ uuid: 'private-run', name: 'Private run', ownerId: 'other-owner', projectId: otherProject._id.toString() });
  await Epoch.create({ trainingId: otherRun._id.toString(), training_uuid: 'private-run', epoch_uuid: 'private-epoch', epoch: 42, epoch_time: 999, timestamp: new Date(), results: {} });
  const body = { projectId, results: {}, source: { epochUuid: 'private-epoch' } };
  expect((await call('POST', '/evaluations', { ...body, uuid: 'unlinked' })).status).toBe(201);
  expect((await call('POST', '/evaluations', { ...body, uuid: 'mismatched', source: { ...body.source, trainingUuid: 'run' } })).status).toBe(201);
  const listed = (await call('GET', `/evaluations?projectId=${projectId}`)).body.data.evaluations;
  expect(listed).toHaveLength(2);
  for (const row of listed) expect(row).not.toHaveProperty('epochInfo');
  const sibling = await Training.create({ uuid: 'sibling-run', name: 'Sibling', ownerId: OWNER, projectId });
  await Epoch.create({ trainingId: sibling._id.toString(), training_uuid: 'sibling-run', epoch_uuid: 'sibling-epoch', epoch: 5, epoch_time: 10, timestamp: new Date(), results: {} });
  for (const trainingUuid of ['run', 'sibling-run']) {
    expect((await call('POST', '/evaluations', { projectId, uuid: trainingUuid, results: {}, source: { trainingUuid, epochUuid: 'sibling-epoch' } })).status).toBe(201);
  }
  const page = (await call('GET', `/evaluations?projectId=${projectId}`)).body.data.evaluations;
  expect(page.find((row: { uuid: string }) => row.uuid === 'run')).not.toHaveProperty('epochInfo');
  expect(page.find((row: { uuid: string }) => row.uuid === 'sibling-run')).toMatchObject({ epochInfo: { epoch: 5, epoch_time: 10 } });
});

it('keeps arbitrary benchmark machine details and measurements through POST and GET', async () => {
  const created = await call('POST', '/benchmarks/upload', { benchmark_uuid: 'bench', training_uuid: 'run', timestamp: new Date().toISOString(),
    system_info: { cpu_count: 8, cpu_count_logical: 16, memory_total_gb: 32, torch_version: '2.5', gpu_names: ['gpu'], custom: { driver: 'x' } },
    results: [{ fps: 30, batch_size: 4, latency_p95_ms: 12.5, energy_j: 0 }] });
  expect(created.status).toBe(201);
  const read = await call('GET', `/benchmarks/${created.body.data._id}`);
  expect(read.body.data).toMatchObject({ system_info: { torch_version: '2.5', gpu_names: ['gpu'], custom: { driver: 'x' } }, results: [{ batch_size: 4, latency_p95_ms: 12.5, energy_j: 0 }] });
  expect((await call('POST', '/benchmarks/upload', { ...created.body.data, training_uuid: 'run' })).status).toBe(409);
  expect(await Benchmark.countDocuments()).toBe(1);
});

it('makes configs and visualization allocations safe to replay', async () => {
  const config = { config_uuid: 'config', summary: 'Config', config_data: { learning_rate: 1 }, projectId };
  expect((await call('POST', '/configs/upload', config)).status).toBe(201);
  expect((await call('POST', '/configs/upload', config)).status).toBe(409);
  expect((await call('GET', '/configs/uuid/config')).status).toBe(200);
  const body = { epoch_uuid: 'epoch', visualization_uuid: 'frame', filename: 'frame.png', type: 'prediction', mimetype: 'image/png' };
  expect((await call('POST', '/visualizations/upload-url', { ...body, visualization_uuid: '../frame' })).status).toBe(400);
  const first = await call('POST', '/visualizations/upload-url', body);
  const repeated = await call('POST', '/visualizations/upload-url', body);
  expect(first.status).toBe(200);
  expect(repeated.body.data.fileId).toBe(first.body.data.fileId);
  expect(await UploadReservation.countDocuments()).toBe(1);
  await UploadReservation.updateOne({ fileId: first.body.data.fileId }, { expiresAt: new Date(0) });
  expect((await call('POST', '/visualizations/upload-url', body)).status).toBe(200);
  await UploadReservation.updateOne({ fileId: first.body.data.fileId }, { resourceId: 'frame', resourceKind: 'visualization' });
  expect((await call('POST', '/visualizations/upload-url', body)).status).toBe(200);
  await UploadReservation.updateOne({ fileId: first.body.data.fileId }, { resourceId: 'different-frame' });
  expect((await call('POST', '/visualizations/upload-url', body)).status).toBe(403);
  await UploadReservation.updateOne({ fileId: first.body.data.fileId }, { resourceId: 'frame' });
  expect((await call('POST', '/visualizations' , { ...body, fileId: first.body.data.fileId, size: 1 })).status).toBe(201);
  expect((await call('POST', '/visualizations/upload-url', body)).status).toBe(409);
});

it('inserts epochs after a duplicate and returns repeated UUIDs for full and partial retries', async () => {
  const rows = ['before', 'epoch', 'after'].map((epoch_uuid, epoch) => ({ epoch_uuid, epoch, trainingId, training_uuid: 'run', results: {} }));
  const result = await call('POST', '/epochs/batch', { epochs: rows });
  expect(result.status).toBe(201);
  expect(result.body.existing).toEqual(['epoch']);
  expect((result.body.data as unknown as { epoch_uuid: string }[]).map(row => row.epoch_uuid)).toEqual(['before', 'after']);
  const repeated = await call('POST', '/epochs/batch', { epochs: rows });
  expect(repeated.status).toBe(201);
  expect(repeated.body.existing).toEqual(['before', 'epoch', 'after']);
  expect(await Epoch.countDocuments()).toBe(3);
});

it('records a test a run reports as an evaluation of its epoch, taking the project and run from the epoch', async () => {
  const write = await call('POST', '/evaluations', { uuid: 'test', source: { epochUuid: 'epoch', epoch: 1 }, results: { overall: { score: 1 } } });
  expect(write.status).toBe(201);
  expect(await Evaluation.findOne({ uuid: 'test' })).toMatchObject({ projectId, source: { trainingId, epochUuid: 'epoch', epoch: 1 } });
  const listed = await call('GET', '/evaluations?projectId=todo-project&page=1&limit=1');
  expect(listed.body.data).toMatchObject({ pagination: { total: 1 }, evaluations: [{ uuid: 'test', run: { uuid: 'run' }, epochInfo: { epoch: 1 } }] });
  expect(listed.body.data.evaluations[0]).not.toHaveProperty('results');
  expect((await call('GET', `/evaluations?trainingId=${trainingId}&include=results`)).body.data).toMatchObject({ evaluations: [{ uuid: 'test', results: { overall: { score: 1 } } }] });
  expect((await call('GET', `/evaluations?trainingId=${trainingId.toUpperCase()}`)).body.data).toMatchObject({ evaluations: [{ uuid: 'test' }] });
  const other = await Project.create({ name: 'Other', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, visibility: 'public' });
  expect((await call('GET', `/evaluations?projectId=${other._id}`, undefined, '')).body.data).toMatchObject({ evaluations: [] });
  // Reporting the same test again is answered with the stored one.
  const again = await call('POST', '/evaluations', { uuid: 'test', source: { epochUuid: 'epoch', epoch: 1 }, results: { overall: { score: 1 } } });
  expect(again.status).toBe(200);
  // The epoch in the trash is no longer named, but what was reported at it is still the run's.
  await Epoch.updateOne({ epoch_uuid: 'epoch' }, { deletedAt: new Date() });
  const orphaned = (await call('GET', '/evaluations?page=1&limit=1')).body.data;
  expect(orphaned).toMatchObject({ pagination: { total: 1 }, evaluations: [{ uuid: 'test', run: { uuid: 'run' } }] });
  expect(orphaned.evaluations[0]).not.toHaveProperty('epochInfo');
  // A project has to be named when the epoch is not known (or is in the trash): the answer is the one a project the
  // caller cannot read gets.
  expect((await call('POST', '/evaluations', { uuid: 'lost', source: { epochUuid: 'never-seen', epoch: 1 }, results: {} })).status).toBe(404);
  expect((await call('POST', '/evaluations', { uuid: 'late', source: { epochUuid: 'epoch', epoch: 1 }, results: {} })).status).toBe(404);
  expect((await call('POST', '/evaluations', { uuid: 'named', projectId: 'todo-project', source: { epochUuid: 'never-seen', epoch: 1 }, results: {} })).status).toBe(201);
});

it('lists a page larger than one BSON document, and names a run only while it is live', async () => {
  await recordTests(Array.from({ length: 350 }, (_, index) => ({
    trainingId, projectId, epoch_uuid: 'epoch', epoch: 1, test_uuid: `large-${index}`,
    timestamp: new Date(), test_results: { overall: { details: 'x'.repeat(50_000) } }
  })));
  const listed = await call('GET', `/evaluations?trainingId=${trainingId}&page=1&limit=1000&include=results`);
  expect(listed.status).toBe(200);
  expect((listed.body.data.evaluations as unknown[])).toHaveLength(350);
  expect(listed.body.data.pagination).toMatchObject({ total: 350, pages: 1 });
  expect(listed.body.data.evaluations[0]).toMatchObject({ run: { uuid: 'run' } });
  await Training.updateOne({ _id: trainingId }, { deletedAt: new Date() });
  const unnamed = (await call('GET', `/evaluations?projectId=${projectId}&page=1&limit=1`)).body.data;
  expect(unnamed.pagination).toMatchObject({ total: 350 });
  expect(unnamed.evaluations[0]).not.toHaveProperty('run');
  expect((await call('GET', `/evaluations?trainingId=${trainingId}&page=1&limit=1`)).body.data).toMatchObject({ evaluations: [], pagination: { total: 0 } });
});

it('stalls silent runs by project timeout, resumes heartbeats, and preserves terminal states', async () => {
  const now = new Date();
  await Training.updateOne({ _id: trainingId }, { lastSeenAt: new Date(now.getTime() - 6 * 60_000) });
  expect(await stallSilentTrainings(now)).toBe(1);
  expect((await Training.findById(trainingId))?.status).toBe('stalled');
  expect((await call('POST', `/trainings/${trainingId}/heartbeat`, {})).status).toBe(200);
  expect((await Training.findById(trainingId))?.status).toBe('running');
  expect(await stallSilentTrainings()).toBe(0);
  await Training.updateOne({ _id: trainingId }, { status: 'stalled' });
  expect((await call('POST', '/epochs/upload', { epoch_uuid: 'second', training_uuid: 'run', epoch: 2, results: {} })).status).toBe(201);
  expect((await Training.findById(trainingId))?.status).toBe('running');
  await Training.updateOne({ _id: trainingId }, { status: 'completed' });
  await call('POST', `/trainings/${trainingId}/heartbeat`, {});
  expect((await Training.findById(trainingId))?.status).toBe('completed');
  expect((await call('POST', `/trainings/${trainingId}/heartbeat`, {}, '')).status).toBe(401);
});

it('honors custom project timeouts and legacy liveness without stalling fresh runs', async () => {
  const now = new Date();
  await Project.updateOne({ _id: projectId }, { $unset: { stallAfterMinutes: 1 } });
  await Training.updateOne({ _id: trainingId }, { lastSeenAt: new Date(now.getTime() - 6 * 60_000) });
  expect(await stallSilentTrainings(now)).toBe(0);
  await Training.updateOne({ _id: trainingId }, { $unset: { lastSeenAt: 1 }, $set: { updatedAt: new Date(now.getTime() - 31 * 60_000) } }, { timestamps: false });
  expect(await stallSilentTrainings(now)).toBe(1);
  expect((await call('PUT', `/projects/${projectId}`, { stallAfterMinutes: 1 })).status).toBe(403);
});

it('refuses a Hub dataset on a project that keeps its files on Visin, on create and on update', async () => {
  const hub = { source: 'hf', name: 'org/dataset', revision: 'commit' };
  const refused = await call('PUT', `/trainings/${trainingId}`, { dataset: hub });
  expect(refused.status).toBe(409);
  expect(refused.body.message).toContain('Switch its storage to Hugging Face');
  expect((await call('POST', '/trainings', { uuid: 'hub-run', name: 'Hub run', projectId, dataset: hub })).status).toBe(409);
  expect(await Training.countDocuments({ uuid: 'hub-run' })).toBe(0);
  // Other kinds of dataset are not the Hub's business.
  expect((await call('PUT', `/trainings/${trainingId}`, { datasetId: 'local-set' })).status).toBe(200);

  await Project.updateOne({ _id: projectId }, { storage: { provider: 'hf' } });
  expect((await call('POST', '/trainings', { uuid: 'hub-run', name: 'Hub run', projectId, dataset: hub })).status).toBe(201);
});

it('updates dataset references and rejects inaccessible heartbeat parents', async () => {
  await Project.updateOne({ _id: projectId }, { storage: { provider: 'hf' } });
  expect((await call('PUT', `/trainings/${trainingId}`, { dataset: { source: 'hf', name: 'org/dataset', revision: 'commit' } })).status).toBe(200);
  expect((await Training.findById(trainingId))?.dataset).toMatchObject({ source: 'hf', name: 'org/dataset' });
  expect((await call('PUT', `/trainings/${trainingId}`, { datasetId: 'local-set', status: 'running' })).status).toBe(200);
  expect((await Training.findById(trainingId))?.dataset).toMatchObject({ source: 'other', name: 'local-set' });
  expect((await call('POST', '/trainings/000000000000000000000abc/heartbeat', {})).status).toBe(403);
});


it('resolves a Visin dataset during run writes and pins the archive actually downloaded', async () => {
  const datasetId = '0000000000000000000000dd';
  process.env.DATASET_SERVICE_URL = 'https://dataset.example.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-test';
  jest.mocked(fetchWithTimeout).mockResolvedValue({ status: 200, ok: true,
    json: async () => ({ data: { source: 'visin', id: datasetId, name: 'ZOD', revision: 'latest-archive' } })
  } as Response);
  try {
    const created = await call('POST', '/trainings', { uuid: 'dataset-run', name: 'Dataset run', datasetId: 'visin:zod' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ datasetId, dataset: { source: 'visin', id: datasetId, name: 'ZOD', revision: 'latest-archive' } });
    expect(JSON.parse(jest.mocked(fetchWithTimeout).mock.calls[0][1]!.body as string)).toEqual({
      reference: 'zod', userId: OWNER, projectOwner: { kind: 'user', id: OWNER }
    });
    const updated = await call('PUT', `/trainings/${created.body.data._id}`, {
      dataset: { source: 'visin', id: datasetId, name: 'ZOD', revision: 'downloaded-archive' }
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ datasetId, dataset: { revision: 'downloaded-archive' } });
    expect(updated.body.data.dataset).not.toHaveProperty('archiveRevision');

    // A dataset that is on the Hub and also has a zip here: both versions are recorded, so a replaced zip shows.
    jest.mocked(fetchWithTimeout).mockResolvedValue({ status: 200, ok: true,
      json: async () => ({ data: { source: 'visin', id: datasetId, name: 'ZOD', revision: 'c'.repeat(40), archiveRevision: '2026-10-01T00:00:00.000Z' } })
    } as Response);
    const both = await call('POST', '/trainings', { uuid: 'hub-zip-run', name: 'Hub and zip', datasetId: 'visin:zod' });
    expect(both.body.data.dataset).toMatchObject({ revision: 'c'.repeat(40), archiveRevision: '2026-10-01T00:00:00.000Z' });
  } finally {
    delete process.env.DATASET_SERVICE_URL;
    delete process.env.INTERNAL_SERVICE_TOKEN;
  }
});


describe('recorded leaderboard and verification', () => {
  const entries = (response: Awaited<ReturnType<typeof call>>) => response.body.data.entries as { evaluationId: string; rank: number; value: number; verified: boolean; epoch?: number; run?: { name: string }; dataset?: string }[];
  it('ranks migrated scores without a suite, keeps the latest per run, and filters verification after selection', async () => {
    await recordTests([
      { projectId, trainingId, test_uuid: 'old', timestamp: new Date('2026-10-01'), test_results: { overall: { score: 0.99 } } },
      { projectId, trainingId, test_uuid: 'latest', epoch: 0, timestamp: new Date('2026-10-02'), test_results: { overall: { score: 0.7, loss: 0.3 } } },
      { projectId, test_uuid: 'other', test_results: { overall: { score: 0.8, loss: 0.2 } } }
    ]);
    const old = await Evaluation.findOne({ uuid: 'old' });
    await verifyEvaluation(old!.id, OWNER, true);
    const board = await call('GET', '/evaluations/leaderboard?metric=overall.score');
    expect(board.status).toBe(200);
    expect(entries(board).map(row => row.value)).toEqual([0.8, 0.7]);
    expect(entries(board)[1]).toMatchObject({ epoch: 0, run: { name: 'Run' }, verified: false });
    expect(entries(await call('GET', '/evaluations/leaderboard?metric=overall.score&verification=verified'))).toEqual([]);
    expect(entries(await call('GET', '/evaluations/leaderboard?metric=overall.score&verification=unverified'))).toHaveLength(2);
    expect(entries(await call('GET', '/evaluations/leaderboard?metric=overall.loss')).map(row => row.value)).toEqual([0.2, 0.3]);
    expect(entries(await call('GET', '/evaluations/leaderboard?metric=overall.loss&direction=max')).map(row => row.value)).toEqual([0.3, 0.2]);
    expect(entries(await call('GET', '/evaluations/leaderboard?metric=missing'))).toEqual([]);
    expect(entries(await call('GET', '/evaluations/leaderboard?projectId=absent'))).toEqual([]);
    expect(entries(await call('GET', '/evaluations/leaderboard?projectId=todo-project'))).toHaveLength(2);
    expect(entries(await call('GET', '/evaluations/leaderboard', undefined, ''))).toHaveLength(2);
  });

  it('a manager or project API job sets and removes the single verification pair idempotently', async () => {
    await recordTests([{ projectId, test_uuid: 'verify-me', test_results: { score: 0 } }]);
    const evaluation = await Evaluation.findOne({ uuid: 'verify-me' });
    const path = `/evaluations/${evaluation!.id}/verification`;
    const verified = await call('POST', path, { verified: true });
    expect(verified.status).toBe(200);
    expect(verified.body.data).toMatchObject({ verified: true, verifiedBy: OWNER, verifiedAt: expect.any(String) });
    expect((await call('POST', path, { verified: true })).body.data).toEqual(verified.body.data);
    expect((await call('GET', `/evaluations/${evaluation!.id}`)).body.data).toMatchObject({ verifiedBy: OWNER, verifiedAt: verified.body.data.verifiedAt });
    expect((await call('GET', `/evaluations/${evaluation!.id}`, undefined, '')).body.data.verifiedBy).toBeUndefined();
    expect(entries(await call('GET', '/evaluations/leaderboard?verification=verified'))).toMatchObject([{ value: 0, verified: true }]);
    expect((await call('POST', path, { verified: false })).body.data).toEqual({ verified: false });
    expect((await call('POST', path, { verified: false })).body.data).toEqual({ verified: false });
    const stored = await Evaluation.findById(evaluation!.id).lean();
    expect(stored).not.toHaveProperty('verifiedAt');
    expect(stored).not.toHaveProperty('verifiedBy');
    expect(stored).not.toHaveProperty('confirmedAt');
    expect(stored).not.toHaveProperty('approvedAt');
    expect((await call('POST', path, { verified: 'true' })).status).toBe(400);
    expect((await call('GET', '/evaluations/leaderboard?verification=maybe')).status).toBe(400);
    expect((await call('POST', path, { verified: true }, '')).status).toBe(401);
    await expect(verifyEvaluation(evaluation!.id, undefined, true)).rejects.toThrow('Authentication required');
    await expect(verifyEvaluation(evaluation!.id, 'other-reader', true)).rejects.toThrow('Manage access');
    await expect(verifyEvaluation('bad-id', OWNER, true)).rejects.toThrow('Evaluation not found');
    await expect(verifyEvaluation(new mongoose.Types.ObjectId().toString(), OWNER, true)).rejects.toThrow('Evaluation not found');
    await projectTokenContext.run({ projectId: 'elsewhere', userId: OWNER }, async () => {
      await expect(verifyEvaluation(evaluation!.id, OWNER, true)).rejects.toThrow('Evaluation not found');
    });
  });

  it('keeps private projects, unpublished suite records, hidden, corrected, failed and deleted results out of anonymous rankings', async () => {
    const privateProject = await Project.create({ name: 'Private', slug: 'private-board', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, visibility: 'private' });
    const privateId = privateProject.id as string;
    await recordTests([
      { projectId, test_uuid: 'public', test_results: { score: 0.5 } },
      { projectId: privateId, test_uuid: 'private', test_results: { score: 0.9 } },
      { projectId, test_uuid: 'suite-private', suite: { id: 'suite', slug: 'suite', version: 1, digest: 'd' }, test_results: { score: 0.8 } },
      { projectId, test_uuid: 'hidden', test_results: { score: 1 } },
      { projectId, test_uuid: 'corrected', test_results: { score: 1 } },
      { projectId, test_uuid: 'failed', test_results: { score: 1 } },
      { projectId, test_uuid: 'deleted', deletedAt: new Date(), test_results: { score: 1 } }
    ]);
    await Evaluation.updateOne({ uuid: 'hidden' }, { hiddenAt: new Date() });
    await Evaluation.updateOne({ uuid: 'corrected' }, { supersededById: 'replacement' });
    // The status is immutable at runtime, so the fixture uses the underlying collection.
    await Evaluation.collection.updateOne({ uuid: 'failed' }, { $set: { status: 'failed' } });
    expect(entries(await call('GET', '/evaluations/leaderboard', undefined, '')).map(row => row.value)).toEqual([0.5]);
    expect(entries(await call('GET', '/evaluations/leaderboard?projectId=private-board', undefined, ''))).toEqual([]);
    const secret = await Evaluation.findOne({ uuid: 'private' });
    await expect(verifyEvaluation(secret!.id, 'stranger', true)).rejects.toThrow('Evaluation not found');
    const suitePrivate = await Evaluation.findOne({ uuid: 'suite-private' });
    await expect(verifyEvaluation(suitePrivate!.id, 'stranger', true)).rejects.toThrow('Evaluation not found');
  });

  it('ranks ties across pages and never enriches a result with a foreign run', async () => {
    const foreign = await Project.create({ name: 'Elsewhere', slug: 'elsewhere', owner: { kind: 'user', id: 'stranger' }, createdBy: 'stranger' });
    const run = await Training.create({ uuid: 'secret-run', name: 'Secret', ownerId: 'stranger', projectId: foreign.id, dataset: { source: 'visin', name: 'Secret data' } });
    await recordTests([0.9, 0.8, 0.8, 0.7].map((score, index) => ({ projectId, trainingId: index === 0 ? run.id : undefined, test_uuid: `tie-${index}`, test_results: { score } })));
    const first = entries(await call('GET', '/evaluations/leaderboard?limit=2'));
    expect(first.map(row => row.rank)).toEqual([1, 2]);
    expect(first[0].run).toBeUndefined();
    expect(first[0].dataset).toBeUndefined();
    const second = await call('GET', '/evaluations/leaderboard?limit=2&page=2');
    expect(entries(second).map(row => row.rank)).toEqual([2, 4]);
    expect(second.body.data.pagination).toEqual({ page: 2, limit: 2, total: 4, pages: 2 });
    expect(entries(await call('GET', '/evaluations/leaderboard?page=5'))).toEqual([]);
  });
});
