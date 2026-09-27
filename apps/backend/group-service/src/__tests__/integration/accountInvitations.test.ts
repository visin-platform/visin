import { createHmac } from 'crypto';
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
import { searchUsers } from '../../clients/authUsersClient';

jest.mock('../../clients/authUsersClient', () => ({ searchUsers: jest.fn() }));
const search = searchUsers as jest.Mock;

const OWNER = '000000000000000000000001';
const ADMIN = '000000000000000000000002';
const MEMBER = '000000000000000000000003';
const MARI = '000000000000000000000004';
const JAAN = '000000000000000000000005';
const secret = 'account-invitation-secret';

describe('"Add member": search and invitations addressed to an account', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  let groupId: string;
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.use('/groups', authenticateToken, router);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/groups`;
    const ids = [OWNER, ADMIN, MEMBER, MARI, JAAN].map(id => new mongoose.Types.ObjectId(id));
    await mongoose.connection.collection('users').insertMany(ids.map(_id => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection.collection('user_sessions').insertMany(ids.map(_id => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
  }, 120_000);

  beforeEach(async () => {
    const group = await service.createGroup(OWNER, 'Road team', 'owner@example.test');
    groupId = String(group._id);
    group.members.push({ userId: ADMIN, email: 'admin@example.test', role: 'admin', joinedAt: new Date() });
    group.members.push({ userId: MEMBER, email: 'member@example.test', role: 'member', joinedAt: new Date() });
    await group.save();
    search.mockReset().mockResolvedValue([
      { id: MARI, email: 'mari.tamm@taltech.ee', firstName: 'Mari', lastName: 'Tamm' },
      { id: MEMBER, email: 'member@example.test', firstName: 'Mari', lastName: 'Member' },
      { id: JAAN, email: 'jaan@example.test' }
    ]);
  });

  afterEach(async () => {
    await Group.deleteMany({});
  });

  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  const call = async (path: string, userId: string, method = 'GET', body?: unknown) => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, tokenVersion: 1, sid: userId, typ: 'session', email: `${userId}@example.test`, iat: now, exp: now + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
  };
  const invite = (userId: string, role = 'member', as = ADMIN) => call(`/${groupId}/invitations`, as, 'POST', { userId, role });

  describe('search', () => {
    it('is for owners and admins, with at least three characters', async () => {
      expect((await call(`/${groupId}/candidates?q=mari`, MEMBER)).status).toBe(403);
      expect((await call(`/${groupId}/candidates?q=mari`, MARI)).status).toBe(403);
      expect((await call(`/${groupId}/candidates?q=ma`, ADMIN)).status).toBe(400);
      expect((await call(`/${groupId}/candidates?q=mari`, OWNER)).status).toBe(200);
      expect(search).toHaveBeenCalledWith('mari', 25);
    });

    it('leaves out members and people already invited, and masks emails a name search found', async () => {
      await invite(JAAN);
      const found = await call(`/${groupId}/candidates?q=mari`, ADMIN);
      expect(found.body.data).toEqual([{ id: MARI, name: 'Mari Tamm', email: 'm••••@taltech.ee' }]);
    });

    it('shows the address when the query was the whole of it', async () => {
      const found = await call(`/${groupId}/candidates?q=${encodeURIComponent('Mari.Tamm@TalTech.ee')}`, ADMIN);
      expect(found.body.data[0]).toEqual({ id: MARI, name: 'Mari Tamm', email: 'mari.tamm@taltech.ee' });
      expect(found.body.data[1]).toEqual({ id: JAAN, email: 'j••••@example.test' });
    });

    it('is rate-limited per account', async () => {
      const statuses = [];
      for (let i = 0; i < 31; i += 1) statuses.push((await call(`/${groupId}/candidates?q=jaan`, OWNER)).status);
      // 30 a minute; an earlier test's search by the same account counts too.
      const firstRefused = statuses.indexOf(429);
      expect(firstRefused).toBeGreaterThanOrEqual(29);
      expect(statuses.slice(0, firstRefused).every(status => status === 200)).toBe(true);
    });
  });

  describe('inviting an account', () => {
    it('invites once, not a member, and within the inviter’s role', async () => {
      const created = await invite(MARI, 'admin');
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ userId: MARI, role: 'admin' });
      expect((await invite(MARI)).status).toBe(409);
      expect((await invite(MEMBER)).status).toBe(409);
      expect((await invite(JAAN, 'owner')).status).toBe(403);
      expect((await invite(JAAN, 'member', MEMBER)).status).toBe(403);
      // A link invitation still works as before.
      expect((await call(`/${groupId}/invitations`, ADMIN, 'POST', { role: 'member' })).body.data.token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('shows the invitation to its account only, who accepts it into the group', async () => {
      await invite(MARI, 'admin');
      expect((await call('/invitations/mine', JAAN)).body.data).toEqual([]);
      const mine = (await call('/invitations/mine', MARI)).body.data;
      expect(mine).toEqual([expect.objectContaining({ groupId, groupName: 'Road team', role: 'admin', invitedBy: 'admin@example.test' })]);

      expect((await call(`/invitations/${mine[0].id}/accept`, JAAN, 'POST')).status).toBe(404);
      const accepted = await call(`/invitations/${mine[0].id}/accept`, MARI, 'POST');
      expect(accepted.status).toBe(200);
      expect(await service.checkMembership(groupId, MARI)).toEqual({ member: true, role: 'admin' });
      expect((await call('/invitations/mine', MARI)).body.data).toEqual([]);
      expect((await call(`/invitations/${mine[0].id}/accept`, MARI, 'POST')).status).toBe(404);
    });

    it('lets its account decline it, which removes it', async () => {
      await invite(MARI);
      const [invitation] = (await call('/invitations/mine', MARI)).body.data;
      expect((await call(`/invitations/${invitation.id}/decline`, JAAN, 'POST')).status).toBe(404);
      expect((await call(`/invitations/${invitation.id}/decline`, MARI, 'POST')).status).toBe(204);
      expect((await call('/invitations/mine', MARI)).body.data).toEqual([]);
      expect((await call('/invitations/not-an-id/decline', MARI, 'POST')).status).toBe(404);
      expect((await call('/invitations/not-an-id/accept', MARI, 'POST')).status).toBe(404);
    });

    it('stops standing once its sender can no longer invite', async () => {
      await invite(MARI);
      const [invitation] = (await call('/invitations/mine', MARI)).body.data;
      await service.updateMemberRole(groupId, OWNER, ADMIN, 'member');
      expect((await call('/invitations/mine', MARI)).body.data).toEqual([]);
      expect((await call(`/invitations/${invitation.id}/accept`, MARI, 'POST')).status).toBe(403);
    });

    it('refuses a group that does not exist, and the 101st pending invitation', async () => {
      const missing = '0000000000000000000000ff';
      await expect(service.findCandidates(missing, OWNER, 'mari')).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.inviteAccount(missing, OWNER, MARI)).rejects.toMatchObject({ statusCode: 404 });

      const far = new Date(Date.now() + 86_400_000);
      await Group.updateOne({ _id: groupId }, {
        $set: { invitations: Array.from({ length: 100 }, (_, i) => ({ tokenHash: `h${i}`, role: 'member', createdBy: OWNER, expiresAt: far })) }
      });
      expect((await invite(MARI)).status).toBe(409);
      // Link invitations sit beside account ones without hiding anyone from search.
      // Searched as the admin: the owner's searches this minute went on the rate-limit test.
      expect((await call(`/${groupId}/candidates?q=mari`, ADMIN)).body.data.map((c: { id: string }) => c.id)).toEqual([MARI, JAAN]);
    });

    it('refuses to accept for someone who joined another way meanwhile', async () => {
      await invite(MARI);
      const [invitation] = (await call('/invitations/mine', MARI)).body.data;
      await Group.updateOne({ _id: groupId }, { $push: { members: { userId: MARI, role: 'member', joinedAt: new Date() } } });
      await expect(service.acceptAccountInvitation(invitation.id, MARI)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('answers a service caller that names the account, which carries no email', async () => {
      const previous = process.env.INTERNAL_SERVICE_TOKEN;
      process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
      try {
        await invite(MARI);
        const internal = (path: string, method = 'GET') =>
          fetch(`${url}${path}`, { method, headers: { 'x-internal-token': 'internal-test-token', 'x-service-id': 'test' } });
        const mine = (await (await internal(`/invitations/mine?userId=${MARI}`)).json()) as { data: { id: string }[] };
        expect(mine.data).toHaveLength(1);
        expect((await internal(`/${groupId}/candidates?q=jaan&userId=${OWNER}`)).status).toBe(200);
        expect((await internal(`/invitations/${mine.data[0].id}/accept?userId=${MARI}`, 'POST')).status).toBe(200);
        const joined = (await Group.findById(groupId))!.members.find(member => member.userId === MARI);
        expect(joined?.email).toBeUndefined();
      } finally {
        if (previous === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
        else process.env.INTERNAL_SERVICE_TOKEN = previous;
      }
    });

    it('lapses after a week', async () => {
      await invite(MARI);
      await Group.updateOne({ _id: groupId }, { $set: { 'invitations.$[].expiresAt': new Date(Date.now() - 1000) } });
      expect((await call('/invitations/mine', MARI)).body.data).toEqual([]);
      // An expired one no longer blocks inviting again.
      expect((await invite(MARI)).status).toBe(201);
    });
  });
});
