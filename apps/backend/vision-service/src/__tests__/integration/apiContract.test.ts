import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import { API_ROUTE_GROUPS } from '../../routes/apiRoutes';
import EpochVisualization from '../../models/EpochVisualization';
import path from 'path';
import { createResponseChecker, loadSpec } from '@visin/backend-core/openapi-testing';

const { operationKey, responseProblems } = createResponseChecker(loadSpec(path.join(__dirname, '../../../docs')), {
  specBase: '/api'
});

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn(async () => []) }));
jest.mock('../../clients/fileServiceClient', () => ({
  getSignedUrl: jest.fn(async (fileId: string) => ({ signedUrl: `https://files.invalid/${fileId}` })),
  getUploadSignedUrl: jest.fn(async () => 'https://files.invalid/upload'),
  getFileMetadata: jest.fn(async () => ({ size: 1 }))
}));

/**
 * The integrator's path through the API, against the real routes and an
 * in-memory MongoDB, with every response checked against docs/openapi.yml:
 * a person sets up a project and a token, a training script sends a run and
 * its results, and reads them back. Errors are part of the path too, since
 * a script meets them.
 */
describe('vision-service responses match docs/openapi.yml', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const owner = '000000000000000000000001';
  const secret = 'api-contract-secret';
  const previousSecret = process.env.JWT_SECRET;
  const seen = new Set<string>();
  /** Every mismatch in a test, reported together at its end rather than one at a time. */
  const problems: string[] = [];

  const session = () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      { alg: 'HS256', typ: 'JWT' },
      { id: owner, email: 'owner@example.test', tokenVersion: 1, sid: owner, typ: 'session', iat: now, exp: now + 600 }
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
      .join('.');
    return `${unsigned}.${crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  };

  /** A request, its response checked against the spec before the test sees it. */
  const call = async (method: string, url: string, { auth, body }: { auth?: string; body?: unknown } = {}) => {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: {
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : undefined;
    const key = operationKey(method, url);
    if (key) seen.add(key);
    problems.push(...responseProblems({ method, url, status: response.status, body: json }));
    return { status: response.status, body: json };
  };

  let token: string;
  let projectId: string;
  let trainingId: string;
  const runUuid = crypto.randomUUID();
  let epochId: string;
  let epochUuid: string;
  let testResultId: string;
  let benchmarkId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware, apiTokenMiddleware);
    for (const { path, guards, router } of API_ROUTE_GROUPS) app.use(path, ...guards, router);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const id = new mongoose.Types.ObjectId(owner);
    await mongoose.connection.collection('users').insertOne({ _id: id, email: 'owner@example.test', tokenVersion: 1 });
    await mongoose.connection
      .collection('user_sessions')
      .insertOne({ _id: id, userId: id, expiresAt: new Date(Date.now() + 3_600_000) });
  }, 120_000);

  afterEach(() => {
    expect(problems.splice(0)).toEqual([]);
  });

  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo?.stop();
  });

  it('sets up a project and a token, signed in', async () => {
    const project = await call('POST', '/api/projects', {
      auth: session(),
      body: { name: 'Contract', isPublic: false }
    });
    expect(project.status).toBe(201);
    projectId = project.body.data._id;

    const created = await call('POST', '/api/api-tokens', { auth: session(), body: { name: 'pipeline', projectId } });
    expect(created.status).toBe(201);
    token = created.body.data.token;

    const listed = await call('GET', `/api/api-tokens/project/${projectId}`, { auth: session() });
    expect(listed.body.data).toHaveLength(1);
    await call('GET', `/api/projects/${projectId}`, { auth: session() });
    await call('GET', '/api/projects', { auth: session() });
  });

  it('starts a run and sends its epochs, with the token', async () => {
    const created = await call('POST', '/api/trainings', {
      auth: token,
      body: { uuid: runUuid, name: 'contract run', status: 'running', tags: ['contract'] }
    });
    expect(created.status).toBe(201);
    trainingId = created.body.data._id;

    for (const epoch of [1, 2]) {
      const uploaded = await call('POST', '/api/epochs/upload', {
        auth: token,
        body: {
          training_uuid: runUuid,
          epoch,
          epoch_time: 12.5,
          results: { train: { loss: 1 / epoch }, val: { mean_iou: 0.3 * epoch } }
        }
      });
      expect(uploaded.status).toBe(201);
      epochId ??= uploaded.body.data._id;
      epochUuid ??= uploaded.body.data.epoch_uuid;
    }

    const batch = await call('POST', '/api/epochs/batch', {
      auth: token,
      body: { epochs: [{ trainingId, training_uuid: runUuid, epoch: 3, results: { train: { loss: 0.3 } } }] }
    });
    expect(batch.status).toBe(201);

    await call('PUT', `/api/trainings/${trainingId}`, { auth: token, body: { status: 'completed' } });
  });

  it('reads the run back', async () => {
    await call('GET', '/api/trainings', { auth: token });
    await call('GET', `/api/trainings/${trainingId}`, { auth: token });
    await call('GET', `/api/trainings/uuid/${runUuid}`, { auth: token });
    await call('GET', `/api/trainings/${trainingId}/epochs`, { auth: token });
    await call('GET', '/api/trainings/stats', { auth: token });
    await call('GET', '/api/trainings/tags', { auth: token });
    await call('POST', '/api/trainings/compare', { auth: token, body: { trainingIds: [trainingId] } });
    await call('GET', `/api/epochs/training/${trainingId}`, { auth: token });
    await call('GET', `/api/epochs/${epochId}`, { auth: token });
    await call('GET', `/api/epochs/uuid/${epochUuid}`, { auth: token });
  });

  it('sends and reads test results and benchmarks', async () => {
    const test = await call('POST', '/api/test-results/upload', {
      auth: token,
      body: { epoch: 2, epoch_uuid: epochUuid, test_results: { night: { overall: { mean_iou: 0.41 } } } }
    });
    expect(test.status).toBe(201);
    testResultId = test.body.data._id;
    await call('GET', '/api/test-results', { auth: token });
    await call('GET', `/api/test-results/${testResultId}`, { auth: token });
    await call('GET', `/api/epochs/uuid/${epochUuid}/test-results`, { auth: token });

    const benchmark = await call('POST', '/api/benchmarks/upload', {
      auth: token,
      body: {
        timestamp: new Date().toISOString(),
        training_uuid: runUuid,
        system_info: { cpu_count: 8, cpu_count_logical: 16, memory_total_gb: 32 },
        results: [{ batch_size: 1, latency_ms: 12.3 }]
      }
    });
    expect(benchmark.status).toBe(201);
    benchmarkId = benchmark.body.data._id;
    await call('GET', '/api/benchmarks', { auth: token });
    await call('GET', `/api/benchmarks/${benchmarkId}`, { auth: token });
  });

  it('lists visualizations', async () => {
    await EpochVisualization.create({
      epoch_uuid: epochUuid,
      visualization_uuid: 'viz-1',
      filename: 'overlay.png',
      type: 'overlay',
      fileId: 'file-1',
      uploadedAt: new Date()
    });
    await call('GET', `/api/visualizations/training/${runUuid}`, { auth: token });
    await call('GET', `/api/visualizations/types?training_uuid=${runUuid}`, { auth: token });
    await call('GET', '/api/visualizations/summary', { auth: token });
  });

  it('records a finding and a comparison, signed in', async () => {
    const finding = await call('POST', '/api/findings', {
      auth: session(),
      body: {
        project: projectId,
        title: 'Night is harder',
        body: 'Mean IoU drops at night.',
        trainingIds: [trainingId]
      }
    });
    expect(finding.status).toBe(201);
    await call('GET', `/api/findings?project=${projectId}`, { auth: session() });
    await call('GET', `/api/findings/${finding.body.data._id}`, { auth: session() });
    await call('GET', `/api/findings/${finding.body.data._id}/latex`, { auth: session() });

    const comparison = await call('POST', '/api/comparisons', {
      auth: session(),
      body: { name: 'baseline vs night', type: 'trainings', itemIds: [trainingId], projectId }
    });
    expect(comparison.status).toBe(201);
    await call('GET', '/api/comparisons', { auth: session() });
    await call('GET', `/api/comparisons/${comparison.body.data._id}`, { auth: session() });
  });

  it('answers the mistakes a script makes as documented', async () => {
    expect((await call('POST', '/api/trainings', { body: { name: 'x' } })).status).toBe(401);
    expect((await call('POST', '/api/trainings', { auth: 'not-a-token', body: { name: 'x' } })).status).toBe(401);
    expect((await call('POST', '/api/projects', { auth: token, body: { name: 'x' } })).status).toBe(403);
    expect(
      (
        await call('POST', '/api/epochs/upload', {
          auth: token,
          body: { training_uuid: 'missing', epoch: 1, results: { a: 1 } }
        })
      ).status
    ).toBe(404);
    expect(
      (await call('POST', '/api/epochs/upload', { auth: token, body: { training_uuid: runUuid, epoch: 1 } })).status
    ).toBe(400);
    expect((await call('GET', '/api/trainings/000000000000000000000099', { auth: token })).status).toBe(404);
  });

  it('cleans up, signed in', async () => {
    const tokens = await call('GET', `/api/api-tokens/project/${projectId}`, { auth: session() });
    await call('DELETE', `/api/api-tokens/${tokens.body.data[0]._id}`, { auth: session() });
    await call('DELETE', `/api/trainings/${trainingId}`, { auth: session() });
  });

  it('covered the integrator path', () => {
    const path = [
      'POST /trainings',
      'PUT /trainings/{id}',
      'GET /trainings',
      'GET /trainings/{id}',
      'POST /epochs/upload',
      'POST /epochs/batch',
      'GET /epochs/training/{trainingId}',
      'POST /test-results/upload',
      'POST /benchmarks/upload',
      'GET /visualizations/training/{training_uuid}',
      'POST /api-tokens',
      'DELETE /api-tokens/{id}'
    ];
    expect(path.filter((operation) => !seen.has(operation))).toEqual([]);
  });
});
