import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { apiKeyAuth, errorHandler } from '@visin/backend-core';
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
  let privateProjectId: string;
  const secret = 'training-config-privacy-test';
  const oldSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use('/trainings', apiKeyAuth('vision'), trainingRoutes);
    app.use('/configs', apiKeyAuth('vision'), configRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    await mongoose.connection.collection('users').insertMany([OWNER, STRANGER].map(id => ({ _id: new mongoose.Types.ObjectId(id), email: `${id}@example.test`, tokenVersion: 1 })));
    // Each test token names a session whose id is its user's.
    await mongoose.connection.collection('user_sessions').insertMany((await mongoose.connection.collection('users').find({}, { projection: { _id: 1 } }).toArray()).map(({ _id }) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    const project = await Project.create({ name: 'Private', owner: { kind: 'user', id: OWNER }, createdBy: OWNER });
    const publicProject = await Project.create({ name: 'Public', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, visibility: 'public' });
    configId = String((await Config.create({ config_uuid: 'shared', summary: 'Public fixture', config_data: { learning_rate: 0.01 }, projectId: String(publicProject._id) }))._id);
    privateProjectId = String(project._id);
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
    const payload = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, email: `${userId}@example.test`, tokenVersion: 1, sid: userId, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
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

  it("shows a public project's config to anyone, without naming the private run that also uses it", async () => {
    for (const path of [`configs/${configId}`, 'configs/uuid/shared']) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ _id: configId, config_data: { learning_rate: 0.01 } });
      expect(response.body.data).not.toHaveProperty('trainingId');
    }
    expect((await get('configs')).body.data.configs).toEqual([expect.objectContaining({ _id: configId })]);
  });

  it("hides a private project's config from everyone who cannot read the project", async () => {
    await Config.updateOne({ _id: configId }, { projectId: privateProjectId });
    for (const user of [undefined, STRANGER]) {
      expect((await get(`configs/${configId}`, user)).status).toBe(404);
      expect((await get('configs/uuid/shared', user)).status).toBe(404);
      expect((await get('configs', user)).body.data).toMatchObject({ configs: [], total: 0 });
    }
    expect((await get(`configs/${configId}`, OWNER)).status).toBe(200);
    expect((await get('configs', OWNER)).body.data.configs).toEqual([expect.objectContaining({ _id: configId })]);
  });

  it('shows a config from before configs had a project to its author alone', async () => {
    // ownerId is immutable through the model; set both as a legacy import would have.
    await Config.collection.updateOne({ _id: new mongoose.Types.ObjectId(configId) }, { $set: { ownerId: STRANGER }, $unset: { projectId: 1 } });
    expect((await get(`configs/${configId}`)).status).toBe(404);
    expect((await get(`configs/${configId}`, OWNER)).status).toBe(404);
    expect((await get(`configs/${configId}`, STRANGER)).status).toBe(200);
    expect((await get('configs/uuid/shared', STRANGER)).status).toBe(200);
  });

  it('answers 404, not a cast error, for a malformed config id', async () => {
    expect((await get('configs/not-an-object-id')).status).toBe(404);
  });

  it('reapplies project visibility on every association request', async () => {
    const training = await Training.findById(privateId);
    await Project.updateOne({ _id: training!.projectId }, { visibility: 'public' });
    expect((await get(`trainings/${privateId}/configs`)).status).toBe(200);
    await Project.updateOne({ _id: training!.projectId }, { visibility: 'private' });
    expect((await get(`trainings/${privateId}/configs`)).status).toBe(403);
    expect((await get(`trainings/${privateId}/configs`, OWNER)).status).toBe(200);
  });

  it('answers an empty list for a run whose config is gone, or that has none', async () => {
    await Config.deleteOne({ _id: configId });
    expect((await get(`trainings/${privateId}/configs`, OWNER)).body.data).toEqual({ configs: [], total: 0 });
    await Training.updateOne({ _id: publicId }, { $unset: { configId: 1 } });
    expect((await get(`trainings/${publicId}/configs`)).body.data).toEqual({ configs: [], total: 0 });
  });
  it('does not expose a private config through a readable training association', async () => {
    await Config.updateOne({ _id: configId }, { projectId: privateProjectId });
    for (const user of [undefined, STRANGER]) {
      expect((await get(`trainings/${publicId}/configs`, user)).body.data).toMatchObject({ configs: [], total: 0 });
    }
  });

});
