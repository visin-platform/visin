import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Epoch from '../../models/Epoch';
import Project from '../../models/Project';
import TestResult from '../../models/TestResult';
import Training from '../../models/Training';
import epochRoutes from '../../routes/epochRoutes';
import trainingRoutes from '../../routes/trainingRoutes';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));

const OWNER = '000000000000000000000001';
const STRANGER = '000000000000000000000002';

/**
 * Delete and restore against a real database: the restore matches rows on the
 * delete's exact timestamp and unsets the field, and both only mean anything to
 * MongoDB itself.
 */
describe('restoring a deleted training with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  let trainingId: string;
  const secret = 'training-restore-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware, apiTokenMiddleware);
    app.use('/trainings', trainingRoutes);
    app.use('/epochs', epochRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    await mongoose.connection.collection('users').insertMany([OWNER, STRANGER].map(id => ({
      _id: new mongoose.Types.ObjectId(id), email: `${id}@example.test`, tokenVersion: 1
    })));
    jest.mocked(getUserGroups).mockResolvedValue([]);
    const projectId = String((await Project.create({ name: 'Private', ownerId: OWNER, isPublic: false }))._id);
    trainingId = String((await Training.create({ name: 'Long run', uuid: 'long-run', ownerId: OWNER, projectId }))._id);
    for (const epoch of [1, 2]) {
      await Epoch.create({
        timestamp: new Date(), trainingId, training_uuid: 'long-run', epoch_uuid: `epoch-${epoch}`, epoch, results: { loss: 1 / epoch }
      });
      await TestResult.create({
        timestamp: new Date(), epoch, epoch_uuid: `epoch-${epoch}`, test_uuid: `test-${epoch}`, test_results: { day: { overall: { score: epoch } } }
      });
    }
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

  const request = async (path: string, method = 'GET', userId = OWNER) => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, email: `${userId}@example.test`, tokenVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}/${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() as { data: Record<string, unknown> } };
  };
  const deletedIds = async (userId = OWNER) =>
    ((await request('trainings/deleted', 'GET', userId)).body.data.trainings as Array<{ _id: string }>).map(row => row._id);
  const live = async () => ({
    epochs: (await Epoch.find({ trainingId, deletedAt: null })).map(row => row.epoch_uuid).sort(),
    tests: (await TestResult.find({ deletedAt: null })).map(row => row.test_uuid).sort()
  });

  it('brings back what the training delete removed, and not an epoch deleted before it', async () => {
    const second = await Epoch.findOne({ epoch_uuid: 'epoch-2' });
    expect((await request(`epochs/${second!._id}`, 'DELETE', STRANGER)).status).toBe(403);
    expect((await request(`epochs/${second!._id}`, 'DELETE')).status).toBe(200);
    expect(await live()).toEqual({ epochs: ['epoch-1'], tests: ['test-1'] });

    expect((await request(`trainings/${trainingId}`, 'DELETE')).status).toBe(200);
    expect(await live()).toEqual({ epochs: [], tests: [] });
    expect((await request(`trainings/${trainingId}`)).status).toBe(404);
    expect(await deletedIds()).toEqual([trainingId]);
    expect(await deletedIds(STRANGER)).toEqual([]);

    expect((await request(`trainings/${trainingId}/restore`, 'POST', STRANGER)).status).toBe(403);
    expect(await live()).toEqual({ epochs: [], tests: [] });

    expect((await request(`trainings/${trainingId}/restore`, 'POST')).status).toBe(200);
    expect(await live()).toEqual({ epochs: ['epoch-1'], tests: ['test-1'] });
    expect((await Training.findById(trainingId))?.deletedAt).toBeUndefined();
    expect((await request(`trainings/${trainingId}`)).status).toBe(200);
    expect(await deletedIds()).toEqual([]);
    expect((await request(`trainings/${trainingId}/restore`, 'POST')).status).toBe(404);
  });

  it('offers a standalone run back to its owner only', async () => {
    const standalone = String((await Training.create({ name: 'Scratch', uuid: 'scratch', ownerId: OWNER }))._id);
    expect((await request(`trainings/${standalone}`, 'DELETE')).status).toBe(200);

    expect(await deletedIds()).toEqual([standalone]);
    expect(await deletedIds(STRANGER)).toEqual([]);
    expect((await request(`trainings/${standalone}/restore`, 'POST', STRANGER)).status).toBe(403);
    expect((await request(`trainings/${standalone}/restore`, 'POST')).status).toBe(200);
  });

  it('keeps the deleted list behind sign-in', async () => {
    const response = await fetch(`${baseUrl}/trainings/deleted`);
    expect(response.status).toBe(401);
  });
});
