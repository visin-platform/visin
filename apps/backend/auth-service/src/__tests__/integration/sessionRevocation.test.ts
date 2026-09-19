import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { authenticateToken, optionalAuth, errorHandler } from '@visin/backend-core';
import authRoutes from '../../routes/authRoutes';
import { User } from '../../models/User';
import { Session } from '../../models/Session';
import { decodeJWT, generateJWT } from '../../services/jwtService';
import { hashPassword } from '../../services/passwordService';
import { SESSION_IDLE_TTL_MS } from '../../services/sessionService';

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';

describe('browser sessions across auth-service and the shared middleware', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const previous = { ...process.env };
  const password = 'original-password';
  const email = 'account@example.test';
  beforeAll(async () => {
    process.env.JWT_SECRET = 'revocation-test-secret';
    process.env.INTERNAL_SERVICE_TOKEN = 'revocation-internal-secret';
    delete process.env.GROUP_SERVICE_URL;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/auth', authRoutes);
    // Stand-ins for any other service: backend-core's middleware, reading the
    // same users and sessions collections.
    app.get('/protected', authenticateToken, (req, res) => res.json({ id: req.user!.id }));
    app.get('/optional', optionalAuth, (req, res) => res.json({ id: req.user?.id ?? null }));
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 120_000);
  afterEach(async () => { await Promise.all([User.deleteMany({}), Session.deleteMany({})]); });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    process.env = previous;
  });

  const createAccount = async () => User.create({ email, signupMethod: 'password', passwordHash: await hashPassword(password), tokenVersion: 1 });
  const headersFor = (token: string, cookie = true): Record<string, string> => cookie ? { cookie: `access_token=${token}` } : { authorization: `Bearer ${token}` };
  const signIn = async (userAgent = CHROME_ANDROID): Promise<string> => {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent },
      body: JSON.stringify({ email, password }) });
    expect(response.status).toBe(200);
    return (await response.json()).token;
  };
  const sidOf = (token: string) => decodeJWT(token)!.sid!;
  const status = async (token: string, path = '/protected') => (await fetch(`${base}${path}`, { headers: headersFor(token) })).status;
  const optionalId = async (token: string) => (await (await fetch(`${base}/optional`, { headers: headersFor(token) })).json()).id;
  const call = (method: string, path: string, token: string, body?: unknown) => fetch(`${base}/auth${path}`, {
    method, headers: { ...headersFor(token), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it('gives every sign-in its own session, named in the token', async () => {
    const user = await createAccount();
    const first = await signIn();
    const second = await signIn(FIREFOX_WINDOWS);

    expect(sidOf(first)).not.toBe(sidOf(second));
    expect(await Session.countDocuments({ userId: user._id })).toBe(2);
    expect(await status(first)).toBe(200);
    expect(await status(first, '/auth/profile')).toBe(200);
  });

  it('ends the session on sign-out, so the same token is refused everywhere', async () => {
    const user = await createAccount();
    const token = await signIn();
    const other = await signIn(FIREFOX_WINDOWS);

    expect((await call('POST', '/logout', token)).status).toBe(200);

    expect(await status(token)).toBe(401);
    expect(await status(token, '/auth/profile')).toBe(401);
    expect(await optionalId(token)).toBeNull();
    // Only this device: the other session is untouched.
    expect(await status(other)).toBe(200);
    expect(await optionalId(other)).toBe(user.id);
  });

  it.each([true, false])('keeps the changing device and ends the rest on password change (cookie=%s)', async cookie => {
    await createAccount();
    const here = await signIn();
    const elsewhere = await signIn(FIREFOX_WINDOWS);

    const changed = await fetch(`${base}/auth/profile/password`, { method: 'POST', headers: { ...headersFor(here, cookie), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: password, newPassword: 'replacement-password' }) });
    expect(changed.status).toBe(200);
    const renewed = (await changed.json()).token;

    // The old token is refused on its version; the other device on both counts.
    expect(await status(here)).toBe(401);
    expect(await status(elsewhere)).toBe(401);
    expect(await status(elsewhere, '/auth/profile')).toBe(401);
    // The device that made the change carries on, in the same session.
    expect(sidOf(renewed)).toBe(sidOf(here));
    expect(await status(renewed)).toBe(200);
    expect(await Session.countDocuments()).toBe(1);
    // A revoked cookie cannot be rescued by another valid header credential.
    expect((await fetch(`${base}/protected`, { headers: { cookie: `access_token=${here}`, authorization: `Bearer ${renewed}` } })).status).toBe(401);
  });

  it('lists the caller\'s own sessions, labelled and marked current', async () => {
    await createAccount();
    const phone = await signIn(CHROME_ANDROID);
    await signIn(FIREFOX_WINDOWS);

    const listed = await (await call('GET', '/sessions', phone)).json();

    expect(listed.data).toHaveLength(2);
    expect(listed.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: sidOf(phone), device: 'Chrome on Android', method: 'password', current: true }),
      expect.objectContaining({ device: 'Firefox on Windows', current: false })
    ]));
  });

  it('revokes another device by id, and nobody else\'s', async () => {
    await createAccount();
    const phone = await signIn();
    const laptop = await signIn(FIREFOX_WINDOWS);
    const stranger = await User.create({ email: 'stranger@example.test', signupMethod: 'password', tokenVersion: 1 });
    const theirs = await Session.create({ userId: stranger._id, method: 'password', lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_IDLE_TTL_MS), absoluteExpiresAt: new Date(Date.now() + SESSION_IDLE_TTL_MS) });

    expect((await call('DELETE', `/sessions/${theirs.id}`, phone)).status).toBe(404);
    expect(await Session.exists({ _id: theirs._id })).not.toBeNull();
    expect((await call('DELETE', '/sessions/not-an-id', phone)).status).toBe(400);

    const revoked = await call('DELETE', `/sessions/${sidOf(laptop)}`, phone);
    expect(await revoked.json()).toEqual({ success: true, signedOut: false });
    expect(await status(laptop)).toBe(401);
    expect(await status(phone)).toBe(200);
  });

  it('signs this browser out when it revokes its own session', async () => {
    await createAccount();
    const token = await signIn();

    const revoked = await call('DELETE', `/sessions/${sidOf(token)}`, token);

    expect(await revoked.json()).toEqual({ success: true, signedOut: true });
    expect(revoked.headers.get('set-cookie')).toMatch(/access_token=;/);
    expect(await status(token)).toBe(401);
  });

  it('signs out every other device and keeps this one', async () => {
    await createAccount();
    const here = await signIn();
    const others = [await signIn(FIREFOX_WINDOWS), await signIn(FIREFOX_WINDOWS)];

    expect(await (await call('POST', '/sessions/revoke-others', here)).json()).toEqual({ success: true, revoked: 2 });

    for (const token of others) expect(await status(token)).toBe(401);
    expect(await status(here)).toBe(200);
  });

  it('slides idle expiry on renewal, never past the hard cap, in the same session', async () => {
    await createAccount();
    const token = await signIn();
    const sid = sidOf(token);
    const cap = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await Session.updateOne({ _id: sid }, { $set: { lastSeenAt: new Date(Date.now() - 60 * 60 * 1000), expiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: cap } });

    const verified = await call('GET', '/verify', token);

    expect(verified.status).toBe(200);
    const renewed = (await verified.json()).token;
    expect(sidOf(renewed)).toBe(sid);
    const session = (await Session.findById(sid))!;
    expect(session.expiresAt.getTime()).toBe(cap.getTime());
    expect(session.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(verified.headers.get('set-cookie')).toMatch(/access_token=/);
  });

  it('refuses a session past its idle expiry even before the TTL monitor removes it', async () => {
    await createAccount();
    const token = await signIn();
    await Session.updateOne({ _id: sidOf(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await status(token)).toBe(401);
    expect(await status(token, '/auth/verify')).toBe(401);
  });

  it('upgrades a pre-sessions token to a session on its next verify', async () => {
    const user = await createAccount();
    const legacy = generateJWT({ id: user.id, email, name: 'Account', tokenVersion: 1 }, new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(await status(legacy)).toBe(200);

    const verified = await fetch(`${base}/auth/verify`, { headers: { ...headersFor(legacy), 'user-agent': FIREFOX_WINDOWS } });

    const upgraded = (await verified.json()).token;
    const session = (await Session.findById(sidOf(upgraded)))!;
    expect(session.method).toBe('unknown');
    expect(session.userAgent).toBe(FIREFOX_WINDOWS);
    expect(await status(upgraded)).toBe(200);
  });

  it('refuses a session-less token that is not a pre-sessions one', async () => {
    const user = await createAccount();
    const forged = generateJWT({ id: user.id, email, name: 'Account', tokenVersion: 1 }, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    expect(await status(forged)).toBe(401);
    expect(await status(forged, '/auth/profile')).toBe(401);
  });

  it('honors administrative token invalidation on the next check, and clears the sessions', async () => {
    await createAccount();
    const token = await signIn();
    expect(await status(token)).toBe(200);
    const invalidated = await fetch(`${base}/auth/internal/invalidate-tokens`, { method: 'POST',
      headers: { 'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN!, 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    expect(invalidated.status).toBe(200);
    expect(await status(token)).toBe(401);
    expect(await status(token, '/auth/profile')).toBe(401);
    expect(await Session.countDocuments()).toBe(0);
  });

  it('does not revive a deleted account when its email is registered again', async () => {
    const user = await createAccount();
    const token = await signIn();
    await User.deleteOne({ _id: user.id });
    await createAccount();
    expect(await status(token)).toBe(401);
    expect(await optionalId(token)).toBeNull();
  });
});
