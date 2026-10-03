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
import TestResult from '../../models/TestResult';
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

it('stores test-result parents and applies a project filter without enumerating all epochs', async () => {
  const write = await call('POST', '/test-results/upload', { test_uuid: 'test', epoch_uuid: 'epoch', epoch: 1, test_results: { overall: { score: 1 } } });
  expect(write.status).toBe(201);
  expect(await TestResult.findOne({ test_uuid: 'test' })).toMatchObject({ projectId, trainingId });
  const listed = await call('GET', '/test-results?projectId=todo-project&page=1&limit=1');
  expect(listed.body.data).toMatchObject({ pagination: { total: 1 }, testResults: [{ test_uuid: 'test', training: { uuid: 'run' } }] });
  expect((await call('GET', `/test-results?trainingId=${trainingId}`)).body.data).toMatchObject({ testResults: [{ test_uuid: 'test' }] });
  expect((await call('GET', `/test-results?trainingId=${trainingId.toUpperCase()}`)).body.data).toMatchObject({ testResults: [{ test_uuid: 'test' }] });
  const other = await Project.create({ name: 'Other', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, visibility: 'public' });
  expect((await call('GET', `/test-results?projectId=${other._id}`, undefined, '')).body.data).toMatchObject({ testResults: [] });
  await Epoch.updateOne({ epoch_uuid: 'epoch' }, { deletedAt: new Date() });
  expect((await call('GET', '/test-results?page=1&limit=1')).body.data).toMatchObject({ testResults: [], pagination: { total: 0 } });
});

it('lists a page larger than one BSON document and counts only live parents', async () => {
  await TestResult.insertMany(Array.from({ length: 350 }, (_, index) => ({
    trainingId, projectId, epoch_uuid: 'epoch', epoch: 1, test_uuid: `large-${index}`,
    timestamp: new Date(), test_results: { overall: { details: 'x'.repeat(50_000) } }
  })));
  await TestResult.create({ trainingId, projectId, epoch_uuid: 'missing-epoch', epoch: 1,
    test_uuid: 'orphan', timestamp: new Date(), test_results: {} });
  const listed = await call('GET', `/test-results?trainingId=${trainingId}&page=1&limit=1000`);
  expect(listed.status).toBe(200);
  expect((listed.body.data.testResults as unknown[])).toHaveLength(350);
  expect(listed.body.data.pagination).toMatchObject({ total: 350, pages: 1 });
  expect((await call('GET', '/test-results/epochs')).body.data).toEqual({ epochs: [1] });
  await Training.updateOne({ _id: trainingId }, { deletedAt: new Date() });
  expect((await call('GET', `/test-results?projectId=${projectId}&page=1&limit=1000`)).body.data)
    .toMatchObject({ testResults: [], pagination: { total: 0 } });
  expect((await call('GET', '/test-results/epochs')).body.data).toEqual({ epochs: [] });
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
