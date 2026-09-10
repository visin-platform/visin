import { createHmac } from 'crypto';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import router from '../../routes/projectGroupsRoutes';
import { Group } from '../../models/Group';

const secret = 'synthetic-project-groups-secret';
const assertion = (overrides: Record<string, unknown> = {}, purpose = 'vision-project-groups') => {
  const body = { userId: 'user-1', email: 'member@example.test', issuedAt: Date.now(), ...overrides };
  const payload = JSON.stringify([purpose, body.userId, body.email, body.issuedAt]);
  return { ...body, signature: createHmac('sha256', secret).update(payload).digest('hex') };
};

describe('project membership assertions with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.use('/api/internal/project-groups', router);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/project-groups`;
  }, 120_000);
  afterEach(async () => { await Group.deleteMany({}); });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });
  const request = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('returns only current, live memberships and no member identities', async () => {
    const live = await Group.create({ name: 'Research', createdBy: 'owner@example.test', members: [{ email: 'member@example.test', role: 'member' }] });
    await Group.create({ name: 'Deleted', createdBy: 'owner@example.test', deletedAt: new Date(), members: [{ email: 'member@example.test', role: 'member' }] });
    await Group.create({ name: 'Other', createdBy: 'owner@example.test', members: [{ email: 'other@example.test', role: 'member' }] });
    const response = await request(assertion({ email: 'MEMBER@example.test' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ success: true, data: [{ id: live._id.toString(), name: 'Research' }] });
    await Group.updateOne({ _id: live._id }, { $set: { members: [] } });
    expect(await (await request(assertion())).json()).toEqual({ success: true, data: [] });
  });
  it.each(['email', 'userId', 'issuedAt'])('rejects a changed %s assertion', async field => {
    const body = assertion();
    const value = field === 'issuedAt' ? body.issuedAt - 1 : field === 'email' ? 'other@example.test' : 'other';
    expect((await request({ ...body, [field]: value })).status).toBe(403);
  });
  it.each([-31_000, 31_000])('rejects assertions outside the timestamp window (%i)', async delta => {
    expect((await request(assertion({ issuedAt: Date.now() + delta }))).status).toBe(403);
  });
  it('rejects unsigned, malformed, or differently purposed assertions', async () => {
    expect((await request({ userId: 'user-1', email: 'member@example.test', issuedAt: Date.now() })).status).toBe(400);
    expect((await request({ ...assertion(), signature: 'not-a-signature' })).status).toBe(400);
    expect((await request(assertion({}, 'different-purpose'))).status).toBe(403);
  });
});
