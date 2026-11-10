import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { vi } from 'vitest';
import { ApiKey, errorHandler } from '@visin/backend-core';
import { User } from '../../models/User';
import { Session } from '../../models/Session';
import { createAdminRoutes } from '../../routes/adminRoutes';
import { signSessionToken } from '../helpers/sessionToken';
describe('platform user administration', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  let adminToken: string;
  let userToken: string;
  let userId: string;
  let adminId: string;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'admin-test-secret';
    process.env.CORS_ORIGIN = 'https://admin.example.test';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/admin', createAdminRoutes());
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
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/admin', createAdminRoutes());
    app.use(errorHandler);
    server.removeAllListeners('request');
    server.on('request', app);
    vi.restoreAllMocks();
    await mongoose.connection.collection('adminmutationlocks').deleteMany({});
    await User.deleteMany({});
    await Session.deleteMany({});
    await ApiKey.deleteMany({});
    const a = await User.create({ email: 'admin@example.test', signupMethod: 'password', roles: ['admin'] });
    const u = await User.create({
      email: 'user@example.test',
      signupMethod: 'password',
      roles: [],
      passwordHash: 'secret-hash'
    });
    adminId = a.id;
    userId = u.id;
    adminToken = await signSessionToken({ id: a.id, email: a.email, tokenVersion: 1 });
    userToken = await signSessionToken({ id: u.id, email: u.email, tokenVersion: 1 });
  });
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    token = adminToken,
    origin = 'https://admin.example.test'
  ) =>
    fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {})
    });
  it('rejects guests and non-admin users', async () => {
    expect((await request('/users', 'GET', undefined, '')).status).toBe(401);
    expect((await request('/users', 'GET', undefined, userToken)).status).toBe(403);
  });
  it('lists only safe user fields and paginates', async () => {
    const result = await (await request('/users')).json();
    expect(result.data.total).toBe(2);
    expect(JSON.stringify(result)).not.toContain('secret-hash');
  });
  it('looks up names for a batch of ids, without credentials, and ignores unknown ids', async () => {
    await User.updateOne({ _id: userId }, { $set: { firstName: 'Ada', lastName: 'Lovelace' } });
    const unknown = '999999999999999999999999';
    const result = await (await request(`/users/lookup?ids=${userId},${adminId},${unknown},${userId}`)).json();
    expect(result.data).toHaveLength(2);
    expect(result.data.find((row: { id: string }) => row.id === userId)).toEqual({
      id: userId,
      email: 'user@example.test',
      name: 'Ada Lovelace'
    });
    expect(JSON.stringify(result)).not.toContain('secret-hash');
    expect((await request('/users/lookup')).status).toBe(400);
    expect((await request('/users/lookup?ids=not-an-id')).status).toBe(400);
    const tooMany = Array.from({ length: 51 }, () => userId).join(',');
    expect((await request(`/users/lookup?ids=${tooMany}`)).status).toBe(400);
    expect((await request(`/users/lookup?ids=${userId}`, 'GET', undefined, userToken)).status).toBe(403);
  });
  it('suspends accounts, revokes sessions and rejects stale edits', async () => {
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Abuse review', status: 'suspended' })).status
    ).toBe(200);
    expect(await Session.countDocuments({ userId })).toBe(0);
    expect((await User.findById(userId))?.tokenVersion).toBe(2);
    expect((await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Stale', status: 'active' })).status).toBe(
      409
    );
  });
  it('prevents last-admin suspension and demotion', async () => {
    expect(
      (await request(`/users/${adminId}`, 'PUT', { revision: 0, reason: 'Suspend', status: 'suspended' })).status
    ).toBe(409);
    expect((await request(`/users/${adminId}`, 'PUT', { revision: 0, reason: 'Demote', admin: false })).status).toBe(
      409
    );
  });
  it('rejects forged browser origins and unknown settings', async () => {
    expect(
      (
        await request(
          `/users/${userId}`,
          'PUT',
          { revision: 0, reason: 'Test', status: 'suspended' },
          adminToken,
          'https://evil.example'
        )
      ).status
    ).toBe(403);
    expect((await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Test', tokenVersion: 100 })).status).toBe(
      400
    );
  });
  it('does not let session/key revocation reach another owner', async () => {
    const own = await Session.findOne({ userId: adminId });
    expect((await request(`/users/${userId}/sessions/${own!.id}`, 'DELETE')).status).toBe(200);
    expect(await Session.findById(own!.id)).not.toBeNull();
  });
  it('cannot remove both active administrators with concurrent edits', async () => {
    const other = await User.create({ email: 'second-admin@example.test', signupMethod: 'password', roles: ['admin'] });
    const responses = await Promise.all(
      [adminId, other.id].map((id) =>
        request(`/users/${id}`, 'PUT', { revision: 0, reason: 'Concurrent demotion', admin: false })
      )
    );
    expect(responses.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(
      await User.countDocuments({ roles: 'admin', status: { $nin: ['suspended', 'deleted'] } })
    ).toBeGreaterThanOrEqual(1);
  });
  it('creates password accounts without returning credentials and rejects duplicate email', async () => {
    const body = {
      email: 'new@example.test',
      password: 'a-long-initial-password',
      firstName: 'New',
      lastName: 'Person'
    };
    const response = await request('/users', 'POST', body);
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(JSON.stringify(result)).not.toContain(body.password);
    expect((await request('/users', 'POST', body)).status).toBe(409);
    expect((await request('/users', 'POST', { email: 'other@example.test', password: body.password })).status).toBe(
      201
    );
  });
  it('searches literal account fields and validates pagination', async () => {
    const response = await (await request('/users?q=user%40example.test&page=1')).json();
    expect(response.data.total).toBe(1);
    for (const path of [
      '/users?page=-1',
      '/users?page=1.5',
      '/users?page=10001',
      '/users?q=',
      '/users?q=' + 'x'.repeat(121)
    ])
      expect((await request(path)).status).toBe(400);
  });
  it('returns safe account history, sessions, keys and memberships', async () => {
    const keyId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('api_keys').insertOne({
      _id: keyId,
      userId,
      name: 'Pipeline',
      hash: 'never-expose-hash',
      sealedCiphertext: 'never-expose-ciphertext',
      scopes: ['vision:read']
    });
    await mongoose.connection.collection('groups').insertOne({
      name: 'Research',
      members: [
        { userId, role: 'member' },
        { userId: adminId, email: 'private-member@example.test', role: 'owner' }
      ]
    });
    const detail = await (await request(`/users/${userId}`)).json();
    expect(detail.data.email).toBe('user@example.test');
    const sessions = await (await request(`/users/${userId}/sessions`)).json();
    expect(sessions.data).toHaveLength(1);
    const keys = await (await request(`/users/${userId}/keys`)).json();
    expect(keys.data[0].name).toBe('Pipeline');
    expect(JSON.stringify(keys)).not.toContain('never-expose');
    const groups = await (await request(`/users/${userId}/memberships`)).json();
    expect(groups.data[0].members).toHaveLength(1);
    expect(JSON.stringify(groups)).not.toContain('private-member');
    expect((await request(`/users/${userId}/keys/${keyId}`, 'DELETE')).status).toBe(200);
    expect((await ApiKey.findById(keyId))?.revokedAt).toBeInstanceOf(Date);
  });
  it('revises names and roles with a durable reason and retains owned data', async () => {
    expect(
      (
        await request(`/users/${userId}`, 'PUT', {
          revision: 0,
          reason: 'Correct profile',
          firstName: 'Alice',
          lastName: 'Smith',
          admin: false
        })
      ).status
    ).toBe(200);
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 1, reason: 'Deactivate account', status: 'deleted' }))
        .status
    ).toBe(200);
    const detail = await (await request(`/users/${userId}`)).json();
    expect(detail.data.status).toBe('deleted');
    expect(detail.data.history).toHaveLength(2);
    expect(
      (
        await request(`/users/${userId}`, 'PUT', {
          revision: 2,
          reason: 'Reactivate account',
          status: 'active',
          admin: true
        })
      ).status
    ).toBe(200);
    expect((await User.findById(userId))?.roles).toContain('admin');
  });
  it('revokes all credentials through the dedicated action', async () => {
    expect((await request(`/users/${userId}/revoke-sessions`, 'POST', {})).status).toBe(200);
    expect(await Session.countDocuments({ userId })).toBe(0);
  });
  it.each([
    { email: 'invalid', password: 'long-enough-password' },
    { email: 'valid@example.test', password: 'short' },
    { email: '', password: 'long-enough-password' },
    { email: 'valid@example.test', password: 'x'.repeat(201) }
  ])('rejects malformed account creation before writing: %j', async (body) => {
    expect((await request('/users', 'POST', body)).status).toBe(400);
    expect(await User.countDocuments()).toBe(2);
  });
  it.each([
    { reason: 'Missing revision' },
    { revision: -1, reason: 'Invalid revision' },
    { revision: 0, reason: '' },
    { revision: 0, reason: 'Bad name', firstName: 123 },
    { revision: 0, reason: 'Bad name', lastName: 'x'.repeat(101) },
    { revision: 0, reason: 'Bad role', admin: 'admin' },
    { revision: 0, reason: 'Bad state', status: 'unknown' }
  ])('rejects invalid account edits: %j', async (body) => {
    expect((await request(`/users/${userId}`, 'PUT', body)).status).toBe(400);
  });
  it('rejects malformed identifiers and missing accounts', async () => {
    expect((await request('/users/not-an-id')).status).toBe(400);
    expect((await request('/users/000000000000000000000001')).status).toBe(404);
  });
  it('waits for a live edit lease and takes over an expired one', async () => {
    const locks = mongoose.connection.collection('adminmutationlocks');
    await locks.insertOne({
      _id: 'users' as never,
      held: true,
      holder: 'other',
      expiresAt: new Date(Date.now() + 60000)
    });
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Blocked', status: 'suspended' })).status
    ).toBe(409);
    expect((await User.findById(userId))?.status).toBe('active');
    // A holder that crashed leaves its lease behind; it lapses instead of blocking edits for good.
    await locks.updateOne({ _id: 'users' as never }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Lease lapsed', status: 'suspended' })).status
    ).toBe(200);
    expect(await locks.findOne({ _id: 'users' as never })).toMatchObject({ held: false });
  });
  it('does not report success before lease release finishes', async () => {
    vi.spyOn(mongoose.models.AdminMutationLock, 'updateOne').mockRejectedValueOnce(new Error('release failed'));
    const result = await request(`/users/${userId}`, 'PUT', {
      revision: 0,
      reason: 'Update name',
      firstName: 'Updated'
    });
    expect(result.status).toBe(500);
    // The write completed, but cleanup failed; never send a premature success response.
    expect((await User.findById(userId))?.firstName).toBe('Updated');
  });
  it('reports a datastore failure while taking the edit lease without editing', async () => {
    vi.spyOn(mongoose.models.AdminMutationLock, 'findOneAndUpdate').mockRejectedValueOnce(new Error('not primary'));
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Unavailable', status: 'suspended' })).status
    ).toBe(500);
    expect((await User.findById(userId))?.status).toBe('active');
  });
  it('refuses to write when its lease was taken over while it waited', async () => {
    const original = mongoose.models.AdminMutationLock.findOneAndUpdate.bind(mongoose.models.AdminMutationLock);
    vi.spyOn(mongoose.models.AdminMutationLock, 'findOneAndUpdate')
      .mockImplementationOnce(original as never)
      .mockResolvedValueOnce(null as never);
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Stalled', status: 'suspended' })).status
    ).toBe(409);
    expect((await User.findById(userId))?.status).toBe('active');
  });
  it('keeps sessions and keys through a profile correction and records only what changed', async () => {
    const response = await request(`/users/${userId}`, 'PUT', {
      revision: 0,
      reason: 'Spelling',
      firstName: 'Corrected',
      status: 'active',
      admin: false
    });
    expect(response.status).toBe(200);
    const user = await User.findById(userId).select('+adminHistory');
    expect(user?.tokenVersion).toBe(1);
    expect(user?.credentialsRevokedAt).toBeUndefined();
    expect(user?.adminHistory?.at(-1)?.changes).toEqual({ firstName: 'Corrected' });
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 1, reason: 'Again', firstName: 'Corrected' })).status
    ).toBe(400);
  });
  it('reports datastore failure during account creation', async () => {
    vi.spyOn(User, 'create').mockRejectedValueOnce(new Error('simulated datastore failure'));
    expect(
      (await request('/users', 'POST', { email: 'failed@example.test', password: 'long-enough-password' })).status
    ).toBe(500);
  });

  it('rejects an administrator whose authority changed while waiting to edit', async () => {
    vi.spyOn(User, 'exists').mockResolvedValueOnce(null);
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'No longer authorized', status: 'suspended' }))
        .status
    ).toBe(403);
    expect((await User.findById(userId))?.status).toBe('active');
  });
  it('does not perform an account edit when the role lock cannot be acquired', async () => {
    vi.spyOn(mongoose.models.AdminMutationLock, 'findOneAndUpdate').mockRejectedValueOnce(
      Object.assign(new Error('duplicate key'), { code: 11000 })
    );
    expect(
      (await request(`/users/${userId}`, 'PUT', { revision: 0, reason: 'Lock unavailable', status: 'suspended' }))
        .status
    ).toBe(409);
    expect((await User.findById(userId))?.status).toBe('active');
  });

  it('issues a recovery credential once without storing its plaintext', async () => {
    const response = await request(`/users/${userId}/password`, 'POST', {
      reason: 'Verified identity through support'
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.token).toMatch(/^[a-f0-9]{64}$/);
    const user = await User.findById(userId).select('+recoveryHash +recoveryExpiresAt');
    expect(user?.recoveryHash).not.toBe(result.data.token);
    expect(user?.recoveryExpiresAt).toBeInstanceOf(Date);
    const detail = await (await request(`/users/${userId}`)).json();
    expect(JSON.stringify(detail)).not.toContain(result.data.token);
    await User.updateOne({ _id: userId }, { $set: { status: 'suspended' } });
    expect((await request(`/users/${userId}/password`, 'POST', { reason: 'Blocked recovery' })).status).toBe(409);
  });
});
