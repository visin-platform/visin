import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApiKey, errorHandler, resetEncryptionKeyCache } from '@visin/backend-core';
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
 * a person sets up a project and a key limited to it, a training script sends a run and
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
  const previousEncryption = process.env.API_KEY_ENCRYPTION_SECRET;
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
    process.env.API_KEY_ENCRYPTION_SECRET = 'api-contract-encryption-secret';
    resetEncryptionKeyCache();
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
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
    if (previousEncryption === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
    else process.env.API_KEY_ENCRYPTION_SECRET = previousEncryption;
    resetEncryptionKeyCache();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo?.stop();
  });

  it('sets up a project and a key limited to it, signed in', async () => {
    const project = await call('POST', '/api/projects', {
      auth: session(),
      body: { name: 'Contract', visibility: 'private' }
    });
    expect(project.status).toBe(201);
    projectId = project.body.data._id;

    // The pipeline's key comes from auth-service, limited to this project.
    token = (
      await createApiKey({
        userId: owner, userEmail: 'owner@example.test', userName: 'Owner', name: 'pipeline',
        scopes: ['vision:read', 'vision:write'], project: { id: projectId, name: 'Contract' }
      })
    ).token;

    await call('GET', `/api/projects/${projectId}`, { auth: session() });
    await call('GET', '/api/projects', { auth: session() });
  });

  it('starts a run and sends its epochs, with the key', async () => {
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

  it('sends and reads test results (evaluations without a suite) and benchmarks', async () => {
    // A test a run reports is an evaluation with no suite; it names its epoch, and the project is the epoch's.
    const test = await call('POST', '/api/evaluations', {
      auth: token,
      body: { source: { epochUuid, epoch: 2 }, results: { night: { overall: { mean_iou: 0.41 } } } }
    });
    expect(test.status).toBe(201);
    testResultId = test.body.data._id;
    await call('GET', `/api/evaluations?trainingUuid=${runUuid}&include=results`, { auth: token });
    await call('GET', `/api/evaluations?epochUuids=${epochUuid}&sortBy=epoch&order=asc`, { auth: token });
    await call('GET', `/api/evaluations/${testResultId}`, { auth: token });

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
    const read = await call('GET', `/api/benchmarks/${benchmarkId}`, { auth: token });
    expect(read.body.data.results[0]).toMatchObject({ batch_size: 1, latency_ms: 12.3 });
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
      'POST /evaluations',
      'POST /benchmarks/upload',
      'GET /visualizations/training/{training_uuid}'
    ];
    expect(path.filter((operation) => !seen.has(operation))).toEqual([]);
  });
});
