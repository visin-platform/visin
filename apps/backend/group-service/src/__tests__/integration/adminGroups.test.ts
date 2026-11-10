import express from 'express';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { Group } from '../../models/Group';
import { createAdminGroupRoutes } from '../../routes/adminGroupRoutes';
describe('platform group membership administration', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  let groupId: string;
  const admin = new mongoose.Types.ObjectId();
  const owner = new mongoose.Types.ObjectId();
  const member = new mongoose.Types.ObjectId();
  beforeAll(async () => {
    process.env.CORS_ORIGIN = 'https://admin.example.test';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.get('x-test-user');
      if (id) req.user = { id };
      next();
    });
    app.use('/admin', createAdminGroupRoutes());
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/admin`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await Group.deleteMany({});
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection.collection('users').insertMany([
      { _id: admin, roles: ['admin'], status: 'active' },
      { _id: owner, email: 'owner@example.test', roles: [], status: 'active' },
      { _id: member, email: 'member@example.test', roles: [], status: 'active' }
    ]);
    const g = await Group.create({
      name: 'Research',
      createdBy: owner.toHexString(),
      members: [{ userId: owner.toHexString(), role: 'owner' }]
    });
    groupId = g.id;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.get('x-test-user');
      if (id) req.user = { id };
      next();
    });
    app.use('/admin', createAdminGroupRoutes());
    app.use(errorHandler);
    server.removeAllListeners('request');
    server.on('request', app);
  });
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    user = admin.toHexString(),
    origin = 'https://admin.example.test'
  ) =>
    fetch(base + path, {
      method,
      headers: { 'x-test-user': user, 'Content-Type': 'application/json', Origin: origin },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {})
    });
  const change = (user = member.toHexString(), role = 'member', revision = 0, method = 'PUT') =>
    request(`/memberships/${groupId}/${user}`, method, { revision, role, reason: 'Reviewed membership' });
  it('requires a live platform admin rather than group ownership or an internal token', async () => {
    expect((await request(`/groups/${groupId}`, 'GET', undefined, '')).status).toBe(401);
    expect((await request(`/groups/${groupId}`, 'GET', undefined, owner.toHexString())).status).toBe(403);
    expect((await request(`/groups/${groupId}`, 'GET', undefined, 'invalid')).status).toBe(403);
  });
  it('returns safe group details and supports adding, changing and removing membership', async () => {
    const detail = await (await request(`/groups/${groupId}`)).json();
    expect(detail.data.members[0]).toEqual({ userId: owner.toHexString(), role: 'owner' });
    const added = await (await change()).json();
    expect(added.data.revision).toBe(1);
    expect((await change(member.toHexString(), 'admin', 1)).status).toBe(200);
    expect((await change(member.toHexString(), 'owner', 2)).status).toBe(200);
    expect((await change(member.toHexString(), 'owner', 3, 'DELETE')).status).toBe(200);
    expect(
      (await request(`/memberships/${groupId}/${member}`, 'DELETE', { revision: 4, reason: 'Already absent' })).status
    ).toBe(200);
  });
  it('protects the last owner and rejects stale membership edits', async () => {
    expect((await change(owner.toHexString(), 'member')).status).toBe(409);
    expect((await change(owner.toHexString(), 'owner', 0, 'DELETE')).status).toBe(409);
    expect((await change(owner.toHexString(), 'owner')).status).toBe(200);
    expect((await change(member.toHexString(), 'member', 100)).status).toBe(409);
  });
  it('cannot remove two owners concurrently', async () => {
    await change(member.toHexString(), 'owner');
    const responses = await Promise.all([
      change(owner.toHexString(), 'owner', 1, 'DELETE'),
      change(member.toHexString(), 'owner', 1, 'DELETE')
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Group.findById(groupId))?.members.filter((m) => m.role === 'owner')).toHaveLength(1);
  });
  it('rejects missing groups, inactive accounts and malformed identifiers', async () => {
    expect((await request('/groups/not-an-id')).status).toBe(400);
    expect((await request('/groups/000000000000000000000001')).status).toBe(404);
    expect(
      (await request(`/memberships/invalid/${member}`, 'PUT', { revision: 0, role: 'member', reason: 'Test' })).status
    ).toBe(400);
    expect(
      (
        await request(`/memberships/000000000000000000000001/${member}`, 'PUT', {
          revision: 0,
          role: 'member',
          reason: 'Test'
        })
      ).status
    ).toBe(404);
    await mongoose.connection.collection('users').updateOne({ _id: member }, { $set: { status: 'suspended' } });
    expect((await change()).status).toBe(404);
  });
  it.each([
    { revision: -1, reason: 'Test', role: 'member' },
    { revision: 0, reason: '', role: 'member' },
    { revision: 0, reason: 'Test', role: 'superuser' }
  ])('rejects invalid membership changes', async (body) => {
    expect((await request(`/memberships/${groupId}/${member}`, 'PUT', body)).status).toBe(400);
  });
  it('rejects untrusted origins, non-JSON writes and unsupported methods', async () => {
    expect(
      (
        await request(
          `/memberships/${groupId}/${member}`,
          'PUT',
          { revision: 0, role: 'member', reason: 'Test' },
          admin.toHexString(),
          'https://evil.example'
        )
      ).status
    ).toBe(403);
    expect((await request(`/memberships/${groupId}/${member}`, 'POST', {})).status).toBe(405);
    const result = await fetch(`${base}/memberships/${groupId}/${member}`, {
      method: 'PUT',
      headers: { 'x-test-user': admin.toHexString(), 'Content-Type': 'text/plain' },
      body: 'invalid'
    });
    expect(result.status).toBe(400);
  });
  it('handles imported groups without a version while preserving optimistic edits', async () => {
    await Group.collection.updateOne({ _id: new mongoose.Types.ObjectId(groupId) }, { $unset: { __v: 1 } });
    const detail = await (await request(`/groups/${groupId}`)).json();
    expect(detail.data.revision).toBe(0);
    expect((await change()).status).toBe(200);
  });
  it('rejects browser mutations when no origin allowlist is configured', async () => {
    delete process.env.CORS_ORIGIN;
    try {
      expect((await change()).status).toBe(403);
    } finally {
      process.env.CORS_ORIGIN = 'https://admin.example.test';
    }
  });
});
