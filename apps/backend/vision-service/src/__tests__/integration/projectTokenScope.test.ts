import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { apiKeyAuth, errorHandler } from '@visin/backend-core';
import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';
import projectRoutes from '../../routes/projectRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import apiTokenRoutes from '../../routes/apiTokenRoutes';
import epochRoutes from '../../routes/epochRoutes';
import testResultRoutes from '../../routes/testResultRoutes';
import benchmarkRoutes from '../../routes/benchmarkRoutes';
import visualizationRoutes from '../../routes/visualizationRoutes';
import comparisonRoutes from '../../routes/comparisonRoutes';
import findingRoutes from '../../routes/findingRoutes';
import configRoutes from '../../routes/configRoutes';
import ApiToken from '../../models/ApiToken';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import TestResult from '../../models/TestResult';
import Benchmark from '../../models/Benchmark';
import EpochVisualization from '../../models/EpochVisualization';
import Comparison from '../../models/Comparison';
import Finding from '../../models/Finding';
import Config from '../../models/Config';

jest.mock('../../services/fileServiceClient', () => ({
  getSignedUrl: jest.fn(async (fileId: string) => ({ signedUrl: `https://files.invalid/${fileId}` })),
  getUploadSignedUrl: jest.fn(async () => 'https://files.invalid/upload'),
  getFileMetadata: jest.fn(async () => ({ size: 1 })),
}));

describe('project token isolation through HTTP and in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  let a: string;
  let b: string;
  let trainingB: string;
  let trainingA: string;
  let tokenId: string;
  let fixtures: Record<string, { project?: string; training: string; epoch: string; test: string; benchmark: string; comparison: string; finding?: string }>;
  const owner = 'same-owner';
  const rawToken = 'a'.repeat(64);
  const secret = 'project-token-integration-secret';
  const oldSecret = process.env.JWT_SECRET;
  const sessionToken = () => {
    const unsigned = [ { alg: 'HS256', typ: 'JWT' }, { id: owner, exp: Math.floor(Date.now() / 1000) + 60 } ]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return `${unsigned}.${crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), apiTokenMiddleware);
    app.use('/api/projects', apiKeyAuth('vision'), projectRoutes);
    app.use('/api/trainings', apiKeyAuth('vision'), trainingRoutes);
    app.use('/api/api-tokens', apiTokenRoutes);
    for (const [path, router] of Object.entries({ epochs: epochRoutes, 'test-results': testResultRoutes,
      benchmarks: benchmarkRoutes, visualizations: visualizationRoutes, comparisons: comparisonRoutes,
      findings: findingRoutes, configs: configRoutes })) app.use(`/api/${path}`, apiKeyAuth('vision'), router);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    const projects = await Project.create([
      { name: 'A', slug: 'a', ownerId: owner },
      { name: 'B', slug: 'b', ownerId: owner },
    ]);
    [a, b] = projects.map(project => String(project._id));
    const other = await Project.create({ name: 'Other owner', slug: 'other', ownerId: 'other' });
    const publicProject = await Project.create({ name: 'Public', slug: 'public', ownerId: 'other', isPublic: true });
    fixtures = {};
    for (const [key, project] of Object.entries({ a, b, other: String(other._id), public: String(publicProject._id), orphan: undefined })) {
      const training = await Training.create({ name: `${key} training`, uuid: `training-${key}`, projectId: project });
      const epoch = await Epoch.create({ trainingId: String(training._id), training_uuid: training.uuid, epoch_uuid: `epoch-${key}`, epoch: key === 'a' ? 1 : 99, results: { loss: 1 }, timestamp: new Date() });
      const test = await TestResult.create({ epoch_uuid: epoch.epoch_uuid, test_uuid: `test-${key}`, epoch: epoch.epoch, timestamp: new Date(), test_results: { clear: { overall: { pixel_accuracy: 0.9 } } } });
      const benchmark = await Benchmark.create({ training_id: key === 'orphan' ? null : training._id, training_uuid: training.uuid,
        timestamp: new Date(), system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 }, results: [] });
      await EpochVisualization.create({ epoch_uuid: epoch.epoch_uuid, visualization_uuid: `viz-${key}`, filename: `${key}.png`, type: key, fileId: `file-${key}`, uploadedAt: new Date() });
      const comparison = await Comparison.create({ uuid: `comparison-${key}`, name: key, type: 'trainings', itemIds: [String(training._id)], projectId: project });
      const finding = project ? await Finding.create({ projectId: project, title: key, body: key, trainingIds: [String(training._id)], authorKind: 'person', authorLabel: owner, authorUserId: owner }) : undefined;
      fixtures[key] = { project, training: String(training._id), epoch: String(epoch._id), test: String(test._id), benchmark: String(benchmark._id), comparison: String(comparison._id), finding: finding ? String(finding._id) : undefined };
    }
    trainingA = fixtures.a.training;
    trainingB = fixtures.b.training;
    tokenId = String((await ApiToken.create({ name: 'A ingestion', projectId: a, createdBy: owner, prefix: rawToken.slice(0, 7),
      tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex') }))._id);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });

  afterAll(async () => {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  const request = async (path: string, method = 'GET', body?: unknown, credential = rawToken) => {
    const response = await fetch(`${url}/api/${path}`, {
      method, headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as { data: Record<string, unknown> } : { data: {} } };
  };

  it('denies reading another private project owned by the same token creator', async () => {
    expect((await request(`trainings/${trainingB}`)).status).toBe(403);
    expect((await request('projects/b')).status).toBe(403);
  });

  it('cannot mint credentials, including for its own project', async () => {
    for (const projectId of [a, b]) {
      expect((await request('api-tokens', 'POST', { name: 'escalation', projectId })).status).toBe(403);
    }
    expect(await ApiToken.countDocuments()).toBe(1);
  });

  it('preserves own-project ingestion and session access to both owned projects', async () => {
    const created = await request('trainings', 'POST', { name: 'Pipeline run' });
    expect(created.status).toBe(201);
    expect(created.body.data.projectId).toBe(a);
    const session = sessionToken();
    expect((await request(`trainings/${trainingB}`, 'GET', undefined, session)).status).toBe(200);
    expect((await request('projects/a')).status).toBe(200);
  });

  it.each(['b', 'other', 'public', 'orphan'])('denies reads and mutations of %s resources', async key => {
    const row = fixtures[key];
    const paths = [`trainings/${row.training}`, `trainings/${row.training}/configs`, `epochs/${row.epoch}`,
      `epochs/uuid/epoch-${key}`, `epochs/uuid/epoch-${key}/test-results`, `test-results/${row.test}`,
      `test-results/test/test-${key}`, `benchmarks/${row.benchmark}`, `visualizations/viz-${key}`,
      `visualizations/epoch/epoch-${key}`, `visualizations/training/training-${key}`,
      `visualizations/types?training_uuid=training-${key}`, `comparisons/${row.comparison}`, `comparisons/uuid/comparison-${key}`];
    if (row.project) paths.push(`projects/${row.project}`, `projects/${row.project}/dashboard-stats`, `findings/${row.finding}`);
    for (const path of paths) expect({ path, status: (await request(path)).status }).toEqual({ path, status: 403 });
    for (const [path, body] of [
      [`trainings/${row.training}`, { name: 'tampered' }], [`epochs/${row.epoch}`, { epoch_time: 100 }],
      [`test-results/${row.test}`, { epoch: 10 }], [`benchmarks/${row.benchmark}`, { results: [] }],
      [`comparisons/${row.comparison}`, { name: 'tampered' }],
    ] as const) expect({ path, status: (await request(path, 'PUT', body)).status }).toEqual({ path, status: 403 });
    const deletes = [`trainings/${row.training}`, `test-results/${row.test}`, `benchmarks/${row.benchmark}`,
      `visualizations/viz-${key}`, `comparisons/${row.comparison}`];
    if (row.finding) deletes.push(`findings/${row.finding}`);
    for (const path of deletes) expect({ path, status: (await request(path, 'DELETE')).status }).toEqual({ path, status: 403 });
    expect((await Training.findById(row.training))?.name).toBe(`${key} training`);
  });

  it('restricts lists, filtered lists, statistics and distinct values to A', async () => {
    expect((await request('projects')).body.data).toEqual([expect.objectContaining({ _id: a })]);
    for (const [path, field, id] of [
      ['trainings', 'trainings', trainingA], ['benchmarks', 'benchmarks', fixtures.a.benchmark],
      ['comparisons', 'comparisons', fixtures.a.comparison], ['test-results?epoch=1', 'testResults', fixtures.a.test],
    ]) {
      const result = await request(path);
      expect(result.status).toBe(200);
      expect(result.body.data[field]).toEqual([expect.objectContaining({ _id: id })]);
    }
    for (const suffix of ['epoch=99', 'epoch_uuids=epoch-b', `projectId=${a}&epoch_uuids=epoch-b`, 'training_uuid=training-a&epoch_uuids=epoch-b']) {
      const result = await request(`test-results?${suffix}&page=1&limit=10`);
      expect(result.status).toBe(200);
      expect(result.body.data.testResults).toEqual([]);
      expect(result.body.data.pagination).toMatchObject({ total: 0 });
    }
    expect((await request('test-results/epochs')).body.data).toEqual({ epochs: [1] });
    expect((await request('visualizations/types')).body.data).toEqual({ types: ['a'] });
    expect((await request('benchmarks/stats')).body.data).toMatchObject({ totalBenchmarks: 1 });
    expect((await request('comparisons/stats')).body.data).toMatchObject({ totalComparisons: 1 });
    expect((await request('trainings/stats')).body.data).toMatchObject({ totalTrainings: 1 });
    expect((await request('findings')).body.data).toEqual([expect.objectContaining({ _id: fixtures.a.finding })]);
    expect((await request('visualizations/training?includeUrls=false')).body.data).toMatchObject({ total: 1 });
  });

  it('rejects project administration and credential listing/revocation', async () => {
    for (const project of [a, b]) {
      expect((await request(`projects/${project}`, 'PUT', { isPublic: true })).status).toBe(403);
      expect((await request(`projects/${project}`, 'DELETE')).status).toBe(403);
      expect((await request(`api-tokens/project/${project}`)).status).toBe(403);
    }
    expect((await request('projects', 'POST', { name: 'New project' })).status).toBe(403);
    expect((await request(`api-tokens/${tokenId}`, 'DELETE')).status).toBe(403);
    expect((await ApiToken.findById(tokenId))?.isActive).toBe(true);
    const session = sessionToken();
    expect((await request('api-tokens', 'POST', { name: 'User-created', projectId: b }, session)).status).toBe(201);
  });

  it('authorizes replacement parents and rejects missing parents', async () => {
    for (const key of ['b', 'other', 'public', 'orphan', 'missing']) {
      expect((await request(`test-results/${fixtures.a.test}`, 'PUT', { epoch_uuid: `epoch-${key}` })).status).toBe(403);
      expect((await request(`benchmarks/${fixtures.a.benchmark}`, 'PUT', { training_uuid: `training-${key}` })).status).toBe(403);
      expect((await request('test-results', 'POST', { epoch_uuid: `epoch-${key}`, epoch: 1, test_results: {} })).status).toBe(403);
      expect((await request('benchmarks', 'POST', { training_uuid: `training-${key}`, timestamp: new Date(), results: [],
        system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 } })).status).toBe(403);
    }
    expect((await request(`benchmarks/${fixtures.a.benchmark}`, 'PUT', { training_uuid: '' })).status).toBe(403);
    expect((await TestResult.findById(fixtures.a.test))?.epoch_uuid).toBe('epoch-a');
    expect((await Benchmark.findById(fixtures.a.benchmark))?.training_uuid).toBe('training-a');
    await Epoch.deleteOne({ _id: fixtures.a.epoch });
    expect((await request(`test-results/${fixtures.a.test}`)).status).toBe(403);
    expect((await request('visualizations/viz-a')).status).toBe(403);
  });

  it('keeps newly written and historical epoch aliases from crossing project boundaries', async () => {
    const body = { trainingId: trainingA, training_uuid: 'training-b', epoch: 2, results: {} };
    expect((await request('epochs', 'POST', body)).status).toBe(201);
    expect((await request('epochs/batch', 'POST', { epochs: [{ ...body, epoch: 3 }] })).status).toBe(201);
    expect(await Epoch.countDocuments({ trainingId: trainingA, training_uuid: 'training-b' })).toBe(0);
    await Epoch.updateOne({ _id: fixtures.b.epoch }, { training_uuid: 'training-a' });
    for (const path of ['visualizations/training/training-a?includeUrls=false', `visualizations/training?projectId=${a}&includeUrls=false`]) {
      expect((await request(path)).body.data).toMatchObject({ total: 1 });
    }
    expect((await request('visualizations/types?training_uuid=training-a')).body.data).toEqual({ types: ['a'] });
    expect((await request('epochs/batch', 'POST', { epochs: [body, { ...body, trainingId: trainingB }] })).status).toBe(403);
  });

  it.each(['trainings', 'epochs', 'tests', 'benchmarks'] as const)('validates %s comparison references on create and update', async type => {
    const field = { trainings: 'training', epochs: 'epoch', tests: 'test', benchmarks: 'benchmark' }[type] as 'training' | 'epoch' | 'test' | 'benchmark';
    const ownIds = [fixtures.a[field], fixtures.a[field]];
    const body = { name: 'Comparison', type, itemIds: ownIds };
    const created = await request('comparisons', 'POST', body);
    expect(created.status).toBe(201);
    for (const key of ['b', 'other', 'public', 'orphan']) {
      const itemIds = [fixtures.a[field], fixtures[key][field]];
      expect((await request('comparisons', 'POST', { ...body, itemIds })).status).toBe(403);
      expect((await request(`comparisons/${created.body.data._id}`, 'PUT', { itemIds })).status).toBe(403);
    }
  });

  it('prevents cross-project finding citations while allowing own-project findings', async () => {
    const body = { project: a, title: 'Evidence', body: 'Observation', trainingIds: [trainingA] };
    expect((await request('findings', 'POST', body)).status).toBe(201);
    expect((await request('findings', 'POST', { ...body, trainingIds: [trainingB] })).status).toBe(403);
  });

  it('preserves shared configs and own-project child ingestion', async () => {
    const config = await Config.create({ config_uuid: 'shared', summary: 'Shared config', config_data: {} });
    await Training.updateMany({}, { configId: String(config._id) });
    expect((await request(`configs/${config._id}`)).status).toBe(200);
    expect((await request(`trainings/${trainingA}/configs`)).status).toBe(200);
    expect((await request('test-results', 'POST', { epoch_uuid: 'epoch-a', epoch: 1, test_results: {} })).status).toBe(201);
    expect((await request('benchmarks', 'POST', { training_uuid: 'training-a', timestamp: new Date(), results: [],
      system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 } })).status).toBe(201);
    const uploaded = await request('visualizations/upload-url', 'POST', { epoch_uuid: 'epoch-a', filename: 'curve.png', type: 'curve', mimetype: 'image/png' });
    expect(uploaded.status).toBe(200);
    expect((await request('visualizations', 'POST', { ...uploaded.body.data, epoch_uuid: 'epoch-a', filename: 'curve.png', type: 'curve', mimetype: 'image/png', size: 1 })).status).toBe(201);
  });

  it('allows own-project updates/deletes without altering cross-project comparisons', async () => {
    await Comparison.updateOne({ _id: fixtures.b.comparison }, { $push: { itemIds: trainingA } });
    for (const [path, body] of [
      [`trainings/${trainingA}`, { name: 'Updated run' }], [`epochs/${fixtures.a.epoch}`, { epoch_time: 2 }],
      [`test-results/${fixtures.a.test}`, { epoch_uuid: 'epoch-a' }],
      [`benchmarks/${fixtures.a.benchmark}`, { training_uuid: 'training-a' }],
      [`comparisons/${fixtures.a.comparison}`, { itemIds: [trainingA] }],
    ] as const) expect({ path, status: (await request(path, 'PUT', body)).status }).toEqual({ path, status: 200 });
    for (const path of [`findings/${fixtures.a.finding}`, 'visualizations/viz-a', `benchmarks/${fixtures.a.benchmark}`,
      `test-results/${fixtures.a.test}`, `trainings/${trainingA}`, `comparisons/${fixtures.a.comparison}`]) {
      expect([200, 204]).toContain((await request(path, 'DELETE')).status);
    }
    expect((await Comparison.findById(fixtures.b.comparison))?.itemIds).toContain(trainingA);
  });

  it('fails closed for missing comparison items, standalone benchmarks and a deleted token project', async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    for (const type of ['trainings', 'epochs', 'tests', 'benchmarks']) {
      expect((await request('comparisons', 'POST', { type, name: 'Missing item', itemIds: [missingId] })).status).toBe(403);
    }
    const benchmark = { timestamp: new Date(), results: [], system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 } };
    expect((await request('benchmarks', 'POST', benchmark)).status).toBe(403);
    await Project.deleteOne({ _id: a });
    expect((await request('benchmarks', 'POST', { ...benchmark, training_uuid: 'training-a' })).status).toBe(403);
    expect((await request('trainings')).body.data.trainings).toEqual([]);
    expect((await request(`trainings/${trainingA}`)).status).toBe(403);
  });

  it('isolates concurrent A/B token and session requests', async () => {
    const otherToken = 'b'.repeat(64);
    await ApiToken.create({ name: 'B ingestion', projectId: b, createdBy: owner, prefix: otherToken.slice(0, 7),
      tokenHash: crypto.createHash('sha256').update(otherToken).digest('hex') });
    const session = sessionToken();
    const results = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
      const credential = [rawToken, otherToken, session][i % 3];
      const response = await request(`trainings/${trainingB}`, 'GET', undefined, credential);
      return response.status;
    }));
    expect(results).toEqual(Array.from({ length: 12 }, (_, i) => i % 3 === 0 ? 403 : 200));
    expect((await request('projects/public', 'GET', undefined, 'invalid-token')).status).toBe(200);
    await ApiToken.updateOne({ _id: tokenId }, { expiresAt: new Date(0) });
    expect((await request('projects/a')).status).toBe(401);
    await ApiToken.updateOne({ _id: tokenId }, { isActive: false });
    expect((await request('projects/a')).status).toBe(403);
  });

  it('does not reinterpret a stored B project ID as an A slug', async () => {
    await Project.updateOne({ _id: a }, { slug: b });
    expect((await request(`trainings/${trainingB}`)).status).toBe(403);
    expect((await request(`trainings/${trainingB}`, 'PUT', { name: 'Escaped' })).status).toBe(403);
    expect((await request(`trainings/${trainingB}`, 'DELETE')).status).toBe(403);
    expect((await request(`epochs/${fixtures.b.epoch}`)).status).toBe(403);
    expect((await request(`findings/${fixtures.b.finding}`)).status).toBe(403);
    expect((await request(`comparisons/${fixtures.b.comparison}`)).status).toBe(403);
    expect((await request(`trainings/${trainingA}`)).status).toBe(200);
    await Project.updateOne({ _id: a }, { isPublic: true });
    expect((await request(`trainings/${trainingB}`, 'GET', undefined, 'invalid-token')).status).toBe(403);
  });

  it('checks benchmark epoch references on create, upload and update', async () => {
    const body = { training_uuid: 'training-a', timestamp: new Date(), results: [],
      system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 } };
    for (const key of ['b', 'public', 'orphan', 'missing']) {
      for (const path of ['benchmarks', 'benchmarks/upload']) {
        expect((await request(path, 'POST', { ...body, epoch_uuid: `epoch-${key}` })).status).toBe(403);
      }
      expect((await request(`benchmarks/${fixtures.a.benchmark}`, 'PUT', { epoch_uuid: `epoch-${key}` })).status).toBe(403);
    }
    expect((await request('benchmarks', 'POST', { ...body, epoch_uuid: 'epoch-a' })).status).toBe(201);
    expect((await request(`benchmarks/${fixtures.a.benchmark}`, 'PUT', { epoch_uuid: 'epoch-a' })).status).toBe(200);
  });
});
