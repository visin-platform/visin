import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { apiKeyAuth, errorHandler } from '@visin/backend-core';
import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';
import trainingRoutes from '../../routes/trainingRoutes';
import configRoutes from '../../routes/configRoutes';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Config from '../../models/Config';

const OWNER = '000000000000000000000001';
const STRANGER = '000000000000000000000002';

describe('training-config privacy with shared public configs', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  let privateId: string;
  let publicId: string;
  let configId: string;
  const secret = 'training-config-privacy-test';
  const oldSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(apiTokenMiddleware);
    app.use('/trainings', apiKeyAuth('vision'), trainingRoutes);
    app.use('/configs', apiKeyAuth('vision'), configRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    await mongoose.connection.collection('users').insertMany([OWNER, STRANGER].map(id => ({ _id: new mongoose.Types.ObjectId(id), email: `${id}@example.test`, tokenVersion: 1 })));
    const project = await Project.create({ name: 'Private', ownerId: OWNER });
    const publicProject = await Project.create({ name: 'Public', ownerId: OWNER, isPublic: true });
    configId = String((await Config.create({ config_uuid: 'shared', summary: 'Public fixture', config_data: { learning_rate: 0.01 } }))._id);
    const trainings = await Training.create([
      { name: 'Private run', uuid: 'private-run', projectId: String(project._id), configId },
      { name: 'Public run', uuid: 'public-run', projectId: String(publicProject._id), configId },
    ]);
    [privateId, publicId] = trainings.map(row => String(row._id));
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

  const get = async (path: string, userId?: string) => {
    const payload = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, email: `${userId}@example.test`, tokenVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    const response = await fetch(`${baseUrl}/${path}`, { headers: userId ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() as { data: Record<string, unknown> } };
  };

  it.each([undefined, STRANGER])('denies private associations to %s', async userId => {
    expect((await get(`trainings/${privateId}/configs`, userId)).status).toBe(403);
    await Training.updateOne({ _id: privateId }, { $unset: { configId: 1 } });
    expect((await get(`trainings/${privateId}/configs`, userId)).status).toBe(403);
  });

  it('allows the private owner and public viewers to read the same config association', async () => {
    for (const [id, user] of [[privateId, OWNER], [publicId, undefined], [publicId, STRANGER]]) {
      const response = await get(`trainings/${id}/configs`, user);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ total: 1, configs: [expect.objectContaining({ _id: configId })] });
    }
  });

  it('hides deleted and absent trainings, including from their owner', async () => {
    await Training.updateMany({}, { deletedAt: new Date() });
    expect((await get(`trainings/${privateId}/configs`, OWNER)).status).toBe(404);
    expect((await get(`trainings/${publicId}/configs`)).status).toBe(404);
    expect((await get(`trainings/${new mongoose.Types.ObjectId()}/configs`, OWNER)).status).toBe(404);
  });

  it('preserves public library contents without exposing a private training association', async () => {
    for (const path of [`configs/${configId}`, 'configs/uuid/shared']) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ _id: configId, config_data: { learning_rate: 0.01 } });
      expect(response.body.data).not.toHaveProperty('trainingId');
    }
    expect((await get('configs')).body.data.configs).toEqual([expect.objectContaining({ _id: configId })]);
  });

  it('reapplies project visibility on every association request', async () => {
    const training = await Training.findById(privateId);
    await Project.updateOne({ _id: training!.projectId }, { isPublic: true });
    expect((await get(`trainings/${privateId}/configs`)).status).toBe(200);
    await Project.updateOne({ _id: training!.projectId }, { isPublic: false });
    expect((await get(`trainings/${privateId}/configs`)).status).toBe(403);
    expect((await get(`trainings/${privateId}/configs`, OWNER)).status).toBe(200);
  });

  it('preserves empty responses and standalone training access', async () => {
    await Training.updateOne({ _id: publicId }, { $unset: { projectId: 1 } });
    expect((await get(`trainings/${publicId}/configs`)).status).toBe(200);
    await Config.deleteOne({ _id: configId });
    expect((await get(`trainings/${privateId}/configs`, OWNER)).body.data).toEqual({ configs: [], total: 0 });
    await Training.updateOne({ _id: publicId }, { $unset: { configId: 1 } });
    expect((await get(`trainings/${publicId}/configs`)).body.data).toEqual({ configs: [], total: 0 });
  });
});
