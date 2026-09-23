import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { apiKeyAuth, errorHandler } from '@visin/backend-core';
import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';
import visualizationRoutes from '../../routes/visualizationRoutes';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import EpochVisualization from '../../models/EpochVisualization';

const OWNER = '000000000000000000000001';
const STRANGER = '000000000000000000000002';

interface SummaryRow {
  _id: string;
  uuid: string;
  name: string;
  total: number;
  types: { type: string; count: number; epochs: number[] }[];
}

describe('visualization summary', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'visualization-summary-test';
  const oldSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(apiTokenMiddleware);
    app.use('/visualizations', apiKeyAuth('vision'), visualizationRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  const epoch = (training: { _id: unknown; uuid: string }, n: number, extra = {}) =>
    Epoch.create({
      trainingId: String(training._id), training_uuid: training.uuid, epoch_uuid: `${training.uuid}-e${n}`,
      epoch: n, timestamp: new Date(), results: {}, ...extra
    });
  const viz = (epochUuid: string, type: string) =>
    EpochVisualization.create({
      epoch_uuid: epochUuid, visualization_uuid: `${epochUuid}-${type}-${Math.random()}`,
      filename: `${type}.png`, type, fileId: `files/${epochUuid}/${type}.png`
    });

  beforeEach(async () => {
    await mongoose.connection.collection('users').insertMany([OWNER, STRANGER].map(id => ({ _id: new mongoose.Types.ObjectId(id), email: `${id}@example.test`, tokenVersion: 1 })));
    // Each test token names a session whose id is its user's.
    await mongoose.connection.collection('user_sessions').insertMany((await mongoose.connection.collection('users').find({}, { projection: { _id: 1 } }).toArray()).map(({ _id }) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));

    const privateProject = await Project.create({ name: 'Private', ownerId: OWNER });
    const publicProject = await Project.create({ name: 'Public', ownerId: OWNER, isPublic: true });
    const [pub, priv, empty] = await Training.create([
      { name: 'Public run', uuid: 'public-run', projectId: String(publicProject._id) },
      { name: 'Private run', uuid: 'private-run', projectId: String(privateProject._id) },
      { name: 'No images', uuid: 'empty-run', projectId: String(publicProject._id) }
    ]);
    await Promise.all([epoch(pub, 1), epoch(pub, 2), epoch(pub, 3, { deletedAt: new Date() }), epoch(priv, 1), epoch(empty, 1)]);
    await Promise.all([
      viz('public-run-e1', 'prediction'), viz('public-run-e1', 'prediction'), viz('public-run-e2', 'prediction'),
      viz('public-run-e2', 'confusion'),
      // On a deleted epoch: not counted.
      viz('public-run-e3', 'prediction'),
      viz('private-run-e1', 'prediction')
    ]);
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

  const summary = async (userId?: string): Promise<SummaryRow[]> => {
    const payload = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, email: `${userId}@example.test`, tokenVersion: 1, sid: userId, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    const response = await fetch(`${baseUrl}/visualizations/summary`, { headers: userId ? { Authorization: `Bearer ${token}` } : {} });
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: { trainings: SummaryRow[] } }).data.trainings;
  };

  it('counts each training\'s visualizations by type and epoch, skipping deleted epochs', async () => {
    const [publicRun] = await summary();
    expect(publicRun).toMatchObject({
      uuid: 'public-run',
      name: 'Public run',
      total: 4,
      types: [
        { type: 'confusion', count: 1, epochs: [2] },
        { type: 'prediction', count: 3, epochs: [1, 2] }
      ]
    });
  });

  it('lists only trainings with images, and only the ones the caller may see', async () => {
    expect((await summary()).map(row => row.uuid)).toEqual(['public-run']);
    expect((await summary(STRANGER)).map(row => row.uuid)).toEqual(['public-run']);
    expect((await summary(OWNER)).map(row => row.uuid).sort()).toEqual(['private-run', 'public-run']);
  });

  it('answers an empty list when nothing is visible', async () => {
    await Project.updateMany({}, { isPublic: false });
    expect(await summary()).toEqual([]);
  });

  it('drops a deleted training', async () => {
    await Training.updateOne({ uuid: 'public-run' }, { deletedAt: new Date() });
    expect(await summary()).toEqual([]);
  });
});
