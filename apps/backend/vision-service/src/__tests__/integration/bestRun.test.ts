import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Epoch from '../../models/Epoch';
import Project from '../../models/Project';
import Training from '../../models/Training';
import trainingRoutes from '../../routes/trainingRoutes';
import { headlineMetric } from '../../services/bestRunService';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));

const OWNER = '000000000000000000000001';
const STRANGER = '000000000000000000000004';

describe('headlineMetric', () => {
  it('prefers the project’s own choice over any guess', () => {
    expect(headlineMetric(['val.mean_iou', 'val.loss'], 'val.loss')).toEqual({ path: 'val.loss', source: 'project' });
  });

  it('guesses a quality score in the validation block, whatever the pipeline calls the block', () => {
    expect(headlineMetric(['train.mean_iou', 'val.accuracy', 'val.loss'], undefined)).toEqual({ path: 'val.accuracy', source: 'guessed' });
    expect(headlineMetric(['Validation.mIoU', 'Validation.loss'], undefined)).toEqual({ path: 'Validation.mIoU', source: 'guessed' });
  });

  it('falls back to the validation loss, then to a score outside validation, then to nothing', () => {
    expect(headlineMetric(['train.mean_iou', 'val.loss'], undefined)).toEqual({ path: 'val.loss', source: 'guessed' });
    expect(headlineMetric(['train.f1', 'extra.value'], undefined)).toEqual({ path: 'train.f1', source: 'guessed' });
    expect(headlineMetric(['weld.quality'], undefined)).toBeNull();
    expect(headlineMetric([], undefined)).toBeNull();
  });
});

/** "Which run is best?" is answered by one result, named in the answer, never by a bare ranking. */
describe('best run with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'best-run-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/trainings', trainingRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    const ids = [OWNER, STRANGER].map(id => new mongoose.Types.ObjectId(id));
    await mongoose.connection.collection('users').insertMany(ids.map(_id => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection.collection('user_sessions').insertMany(ids.map(_id => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    jest.mocked(getUserGroups).mockResolvedValue([]);
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

  const get = async (path: string, user: string | '' = OWNER) => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: user, email: `${user}@example.test`, tokenVersion: 1, sid: user, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}${path}`, { headers: user ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() };
  };

  const project = async (fields: Record<string, unknown> = {}) =>
    String((await Project.create({ name: 'Road', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, ...fields }))._id);
  const run = async (projectId: string, name: string, epochs: Record<string, unknown>[], extra: Record<string, unknown> = {}) => {
    const training = await Training.create({ uuid: `run-${new mongoose.Types.ObjectId()}`, name, ownerId: OWNER, projectId, status: 'completed', ...extra });
    for (const [index, results] of epochs.entries()) {
      await Epoch.create({ trainingId: String(training._id), training_uuid: 'u', epoch_uuid: `e-${training._id}-${index}`, epoch: index + 1, timestamp: new Date(), results });
    }
    return String(training._id);
  };
  const scores = (...values: number[]) => values.map(value => ({ val: { mean_iou: value, loss: 1 - value } }));

  it('crowns the run with the highest validation score, at the epoch it peaked, and says the metric was guessed', async () => {
    const projectId = await project();
    await run(projectId, 'baseline', scores(0.4, 0.5));
    const winner = await run(projectId, 'clft', scores(0.5, 0.8, 0.7));
    await run(projectId, 'still going', scores(0.6), { status: 'running' });

    const { status, body } = await get(`/trainings/best?projectId=${projectId}`);

    expect(status).toBe(200);
    expect(body.data.runs).toBe(3);
    expect(body.data.best).toMatchObject({
      training: { _id: winner, name: 'clft' },
      project: { name: 'Road' },
      metric: { path: 'val.mean_iou', direction: 'higher', directionFrom: 'default', source: 'guessed' },
      value: 0.8,
      epoch: 2
    });
  });

  it('judges by the project’s headline result and reads lower as better when the taxonomy says so', async () => {
    const projectId = await project({ taxonomy: { primaryMetric: 'val.error', metrics: [{ key: 'error', direction: 'lower' }] } });
    await run(projectId, 'noisy', [{ val: { error: 0.4, mean_iou: 0.9 } }]);
    const winner = await run(projectId, 'steady', [{ val: { error: 0.3, mean_iou: 0.2 } }, { val: { error: 0.1, mean_iou: 0.2 } }]);

    const { body } = await get(`/trainings/best?projectId=${projectId}`);

    expect(body.data.best).toMatchObject({
      training: { _id: winner },
      metric: { path: 'val.error', direction: 'lower', directionFrom: 'taxonomy', source: 'project' },
      value: 0.1,
      epoch: 2
    });
  });

  it('ranks runs that log a bare number beside their blocks, instead of reporting no best run', async () => {
    const projectId = await project();
    await run(projectId, 'weak', [{ lr: 0.001, train: { loss: 0.5 }, val: { loss: 0.6, mean_iou: 0.4 } }]);
    const winner = await run(projectId, 'strong', [{ lr: 0.001, train: { loss: 0.3 }, val: { loss: 0.3, mean_iou: 0.8 } }]);

    const { body } = await get(`/trainings/best?projectId=${projectId}`);

    expect(body.data.best).toMatchObject({ training: { _id: winner }, metric: { path: 'val.mean_iou', source: 'guessed' }, value: 0.8 });
  });

  it('ranks on a result whose name holds a dot or punctuation', async () => {
    const projectId = await project({ taxonomy: { primaryMetric: 'val.map_0.5' } });
    await run(projectId, 'weak', [{ val: { 'map_0.5': 0.3 } }]);
    const winner = await run(projectId, 'strong', [{ val: { 'map_0.5': 0.6 } }, { val: { 'map_0.5': 0.5 } }]);
    expect((await get(`/trainings/best?projectId=${projectId}`)).body.data.best).toMatchObject({ training: { _id: winner }, metric: { path: 'val.map_0.5' }, value: 0.6, epoch: 1 });

    const punctuated = await project({ name: 'Punctuated', taxonomy: { primaryMetric: 'metrics/mAP50-95(B)' } });
    await run(punctuated, 'a', [{ 'metrics/mAP50-95(B)': 0.2 }]);
    const other = await run(punctuated, 'b', [{ 'metrics/mAP50-95(B)': 0.7 }]);
    expect((await get(`/trainings/best?projectId=${punctuated}`)).body.data.best).toMatchObject({ training: { _id: other }, metric: { path: 'metrics/mAP50-95(B)' }, value: 0.7 });
  });

  it('picks the headline from what the runs report, not from the one run with the most epochs', async () => {
    const projectId = await project();
    // An evaluation-only run with a very long history, and many short runs that report a validation score.
    await run(projectId, 'long', Array.from({ length: 30 }, (_, i) => ({ probe: { latency: i + 1 } })));
    for (const [name, value] of [['a', 0.4], ['b', 0.9], ['c', 0.5]] as const) await run(projectId, name, scores(value));

    const { body } = await get(`/trainings/best?projectId=${projectId}`);

    expect(body.data.best).toMatchObject({ metric: { path: 'val.mean_iou' }, value: 0.9 });
  });

  it('names nobody when the runs report nothing that reads as a score, or when there are none', async () => {
    const projectId = await project();
    await run(projectId, 'odd', [{ weld: { quality: 3 } }]);
    expect((await get(`/trainings/best?projectId=${projectId}`)).body.data).toEqual({ runs: 1, best: null });

    const empty = await project({ name: 'Empty' });
    expect((await get(`/trainings/best?projectId=${empty}`)).body.data).toEqual({ runs: 0, best: null });
  });

  it('takes the best across the projects holding runs on a dataset, comparing only like with like', async () => {
    const road = await project();
    const lab = await project({ name: 'Lab' });
    const odd = await project({ name: 'Odd' });
    await run(road, 'road a', scores(0.6), { datasetId: 'zod' });
    const best = await run(lab, 'lab a', scores(0.9), { datasetId: 'zod' });
    await run(lab, 'lab b', scores(0.7), { datasetId: 'zod' });
    await run(road, 'elsewhere', scores(0.99), { datasetId: 'other' });
    // Two runs judged by loss, against three by IoU: the most-used measure decides, and a loss is not an IoU.
    await run(odd, 'loss one', [{ val: { loss: 0.1 } }], { datasetId: 'zod' });
    await run(odd, 'loss two', [{ val: { loss: 0.2 } }], { datasetId: 'zod' });

    const { body } = await get('/trainings/best?datasetId=zod');

    expect(body.data.runs).toBe(5);
    expect(body.data.best).toMatchObject({ training: { _id: best }, project: { name: 'Lab' }, metric: { path: 'val.mean_iou' }, value: 0.9 });
  });

  it('keeps a private project’s runs to those who may read them', async () => {
    const projectId = await project({ visibility: 'private' });
    await run(projectId, 'secret', scores(0.9), { datasetId: 'zod' });

    expect((await get(`/trainings/best?projectId=${projectId}`, STRANGER)).status).toBe(403);
    expect((await get('/trainings/best?datasetId=zod', STRANGER)).body.data).toEqual({ runs: 0, best: null });
    expect((await get(`/trainings/best?projectId=${projectId}`)).body.data.best).not.toBeNull();
  });

  it('wants a project or a dataset, and a project that exists', async () => {
    expect((await get('/trainings/best')).status).toBe(400);
    expect((await get('/trainings/best?projectId=nope')).status).toBe(404);
  });
});
