import { createHmac, createHash } from 'crypto';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { authenticateToken } from '../../middleware/authMiddleware';
import router from '../../routes/groupRoutes';
import { Group } from '../../models/Group';
import * as service from '../../services/groupService';

const secret = 'synthetic-invitation-secret';
describe('account-bound invitations with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  let id: string;
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.use('/groups', authenticateToken, router);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/groups`;
  }, 120_000);
  beforeEach(async () => { id = String((await service.createGroup('Owner-ID', 'Research', 'shared@example.test'))._id); });
  afterEach(async () => { jest.restoreAllMocks(); await Group.deleteMany({}); });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });
  const request = async (path: string, method = 'GET', body?: unknown, userId = 'Owner-ID') => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, email: 'shared@example.test', exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    return fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  };
  const invite = async (role: 'owner' | 'admin' | 'member' = 'member') => service.createInvitation(id, 'Owner-ID', role);

  it('never grants authority through the same email or an injected actor ID', async () => {
    expect((await request(`/${id}`, 'GET', undefined, 'Other-ID')).status).toBe(403);
    expect(await (await request('/mine?userId=Owner-ID', 'GET', undefined, 'Other-ID')).json()).toEqual({ success: true, data: [] });
    expect((await request(`/${id}`, 'PATCH', { name: 'Hijacked', userId: 'Owner-ID' }, 'Other-ID')).status).toBe(403);
    expect(await service.checkMembership(id, 'owner-id')).toEqual({ member: false, role: null });
  });

  it('creates a secret once, previews without consuming it, then binds acceptance to the signed-in account', async () => {
    const created = await request(`/${id}/invitations`, 'POST', {});
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const { data: invitation } = await created.json() as { data: { token: string; expiresAt: string } };
    expect(invitation.token).toMatch(/^[a-f0-9]{64}$/);
    const stored = await Group.findById(id).select('+invitations');
    expect(stored!.invitations![0].tokenHash).toBe(createHash('sha256').update(invitation.token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain('invitations');
    expect(await (await request(`/${id}`)).text()).not.toContain('tokenHash');
    expect((await request('/invitations/preview', 'POST', { token: invitation.token }, '')).status).toBe(401);
    const preview = await request('/invitations/preview', 'POST', { token: invitation.token }, 'Other-ID');
    expect(preview.status).toBe(200);
    expect((await Group.findById(id))!.members).toHaveLength(1);
    const accepted = await request('/invitations/accept', 'POST', { token: invitation.token, userId: 'Owner-ID', role: 'owner' }, 'Other-ID');
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).not.toContain('invitations');
    expect(await service.checkMembership(id, 'Other-ID')).toEqual({ member: true, role: 'member' });
    await service.removeMember(id, 'Owner-ID', 'Other-ID');
    expect((await request('/invitations/accept', 'POST', { token: invitation.token }, 'Other-ID')).status).toBe(404);
  });

  it('allows only owners to invite owners and only administrators to invite anyone', async () => {
    await service.acceptInvitation((await invite('admin')).token, 'Admin-ID');
    await service.acceptInvitation((await invite()).token, 'Member-ID');
    expect((await request(`/${id}/invitations`, 'POST', { role: 'owner' }, 'Admin-ID')).status).toBe(403);
    expect((await request(`/${id}/invitations`, 'POST', {}, 'Member-ID')).status).toBe(403);
    expect((await request(`/${id}/invitations`, 'POST', { role: 'admin' }, 'Admin-ID')).status).toBe(201);
    expect((await request(`/${id}/invitations`, 'POST', { role: 'boss' })).status).toBe(400);
    await expect(service.createInvitation(String(new mongoose.Types.ObjectId()), 'Owner-ID')).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['expire', 'revoke', 'delete', 'remove-inviter', 'demote-inviter'] as const)('rejects invitations after %s', async action => {
    const invitation = await invite('owner');
    if (action === 'expire') await Group.updateOne({ _id: id }, { $set: { 'invitations.0.expiresAt': new Date(0) } });
    if (action === 'revoke') expect((await request(`/${id}/invitations`, 'DELETE')).status).toBe(204);
    if (action === 'delete') await service.deleteGroup(id, 'Owner-ID');
    if (action === 'remove-inviter' || action === 'demote-inviter') {
      await service.acceptInvitation((await invite('owner')).token, 'Second-ID');
      if (action === 'remove-inviter') await service.removeMember(id, 'Second-ID', 'Owner-ID');
      else await service.updateMemberRole(id, 'Second-ID', 'Owner-ID', 'admin');
    }
    await expect(service.previewInvitation(invitation.token)).rejects.toMatchObject({ statusCode: action.endsWith('inviter') ? 403 : 404 });
    await expect(service.acceptInvitation(invitation.token, 'Other-ID')).rejects.toBeDefined();
  });

  it('allows one acceptance under concurrency and does not elevate an existing member', async () => {
    const invitation = await invite();
    const results = await Promise.allSettled(['First-ID', 'Second-ID'].map(userId => service.acceptInvitation(invitation.token, userId)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const members = (await Group.findById(id))!.members;
    expect(members).toHaveLength(2);
    const elevated = await invite('owner');
    await expect(service.acceptInvitation(elevated.token, members[1].userId)).rejects.toMatchObject({ statusCode: 409 });
    expect((await Group.findById(id))!.members[1].role).toBe('member');
    await expect(service.acceptInvitation(invitation.token, 'Third-ID')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects malformed tokens, caps pending invitations, and prunes expired invitations', async () => {
    await expect(service.previewInvitation('bad')).rejects.toMatchObject({ statusCode: 404 });
    expect((await request('/invitations/accept', 'POST', { token: 'bad' })).status).toBe(400);
    const template = { tokenHash: 'a'.repeat(64), role: 'member', createdBy: 'Owner-ID', expiresAt: new Date(Date.now() + 60_000) };
    await Group.updateOne({ _id: id }, { $set: { invitations: Array.from({ length: 100 }, () => template) } });
    await expect(invite()).rejects.toMatchObject({ statusCode: 409 });
    await Group.updateOne({ _id: id }, { $set: { 'invitations.$[].expiresAt': new Date(0) } });
    await invite();
    expect((await Group.findById(id).select('+invitations'))!.invitations).toHaveLength(1);
    await expect(service.revokeInvitations(String(new mongoose.Types.ObjectId()), 'Owner-ID')).rejects.toMatchObject({ statusCode: 404 });
  });
});
