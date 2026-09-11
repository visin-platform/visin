import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { authenticateToken, optionalAuth, errorHandler } from '@visin/backend-core';
import authRoutes from '../../routes/authRoutes';
import { User } from '../../models/User';
import { generateJWT } from '../../services/jwtService';
import { hashPassword } from '../../services/passwordService';

describe('session revocation across auth and shared middleware', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const previous = { ...process.env };
  const password = 'original-password';
  beforeAll(async () => {
    process.env.JWT_SECRET = 'revocation-test-secret';
    process.env.INTERNAL_SERVICE_TOKEN = 'revocation-internal-secret';
    delete process.env.GROUP_SERVICE_URL;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/auth', authRoutes);
    app.get('/protected', authenticateToken, (req, res) => res.json({ id: req.user!.id }));
    app.get('/optional', optionalAuth, (req, res) => res.json({ id: req.user?.id ?? null }));
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 120_000);
  afterEach(async () => { await User.deleteMany({}); });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    process.env = previous;
  });
  const createAccount = async () => User.create({ email: 'account@example.test', signupMethod: 'password', passwordHash: await hashPassword(password), tokenVersion: 1 });
  const tokenFor = (user: { id: string; email: string; tokenVersion: number }) => generateJWT({ id: user.id, email: user.email, name: 'Account', tokenVersion: user.tokenVersion });
  const headersFor = (token: string, cookie: boolean): Record<string, string> => cookie ? { cookie: `access_token=${token}` } : { authorization: `Bearer ${token}` };

  it.each([true, false])('cuts off the retained credential after password change (cookie=%s)', async cookie => {
    const user = await createAccount();
    const oldToken = tokenFor(user);
    const headers = headersFor(oldToken, cookie);
    expect((await fetch(`${base}/protected`, { headers })).status).toBe(200);
    expect(await (await fetch(`${base}/optional`, { headers })).json()).toEqual({ id: user.id });
    const changed = await fetch(`${base}/auth/profile/password`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: password, newPassword: 'replacement-password' }) });
    expect(changed.status).toBe(200);
    expect((await fetch(`${base}/auth/profile`, { headers })).status).toBe(401);
    expect((await fetch(`${base}/protected`, { headers })).status).toBe(401);
    expect(await (await fetch(`${base}/optional`, { headers })).json()).toEqual({ id: null });
    const fresh = tokenFor((await User.findById(user.id))!);
    expect((await fetch(`${base}/protected`, { headers: headersFor(fresh, cookie) })).status).toBe(200);
    // A revoked cookie cannot be rescued by another valid header credential.
    expect((await fetch(`${base}/protected`, { headers: { cookie: `access_token=${oldToken}`, authorization: `Bearer ${fresh}` } })).status).toBe(401);
  });

  it('honors administrative token invalidation on the next authorization check', async () => {
    const user = await createAccount();
    const headers = headersFor(tokenFor(user), false);
    expect((await fetch(`${base}/protected`, { headers })).status).toBe(200);
    const invalidated = await fetch(`${base}/auth/internal/invalidate-tokens`, { method: 'POST',
      headers: { 'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN!, 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email }) });
    expect(invalidated.status).toBe(200);
    expect((await fetch(`${base}/protected`, { headers })).status).toBe(401);
    expect((await fetch(`${base}/auth/profile`, { headers })).status).toBe(401);
  });

  it('does not revive a deleted account when its email is registered again', async () => {
    const user = await createAccount();
    const headers = headersFor(tokenFor(user), false);
    await User.deleteOne({ _id: user.id });
    await createAccount();
    expect((await fetch(`${base}/protected`, { headers })).status).toBe(401);
    expect(await (await fetch(`${base}/optional`, { headers })).json()).toEqual({ id: null });
  });
});
