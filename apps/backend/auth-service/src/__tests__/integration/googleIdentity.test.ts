import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { User } from '../../models/User';
import authRoutes from '../../routes/authRoutes';
import { verifyGoogleToken } from '../../services/googleAuthService';
import { generateJWT, verifyJWT } from '../../services/jwtService';
import * as passwords from '../../services/passwordService';
import { linkGoogleAccount } from '../../services/googleLinkService';

jest.mock('../../services/googleAuthService', () => ({ verifyGoogleToken: jest.fn() }));
const google = verifyGoogleToken as jest.Mock;
const password = 'test-current-password';

describe('Google account authority with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  let passwordHash: string;
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    process.env.JWT_SECRET = 'google-identity-integration-secret';
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    delete process.env.GROUP_SERVICE_URL;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    await User.init();
    passwordHash = await passwords.hashPassword(password);
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/auth`;
  }, 120_000);
  beforeEach(() => {
    google.mockReset().mockResolvedValue({ sub: 'subject-1', email: 'victim@example.test', email_verified: true, name: 'Google User' });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await User.deleteMany({});
    process.env.GOOGLE_CLIENT_ID = 'test-client';
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    process.env = oldEnv;
  });

  const account = (email = 'victim@example.test', extra = {}) => User.create({ email, signupMethod: 'password', passwordHash, roles: ['admin'], ...extra });
  const token = (user: { id: string; email: string; tokenVersion: number }, extra = {}) => generateJWT({ id: user.id, email: user.email, name: 'Account', tokenVersion: user.tokenVersion, ...extra });
  const post = (path: string, body: object, jwt?: string) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify(body)
  });
  const linkBody = { currentPassword: password, idToken: 'google-token' };

  it('does not grant Google the authority of a same-email password account', async () => {
    const user = await account();
    expect((await post('/validate', { idToken: 'google-token' })).status).toBe(409);
    expect((await post('/login', { email: user.email, password })).status).toBe(200);
    expect(await User.countDocuments()).toBe(1);
    expect((await User.findById(user.id).select('+googleSubject'))!.googleSubject).toBeUndefined();
  });

  it('links deliberately and keeps database identity when Google changes email', async () => {
    const user = await account();
    await account('other@example.test');
    const response = await post('/profile/google', linkBody, token(user));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('access_token=');
    google.mockResolvedValue({ sub: 'subject-1', email: 'other@example.test' });
    const login = await post('/validate', { idToken: 'google-token' });
    expect(login.status).toBe(200);
    const result = await login.json();
    expect(verifyJWT(result.token)).toMatchObject({ id: user.id, email: user.email, tokenVersion: 2 });
    const stored = (await User.findById(user.id).select('+passwordHash +googleSubject'))!;
    expect(stored).toMatchObject({ email: user.email, passwordHash, googleSubject: 'subject-1', roles: ['admin'] });
    expect((await post('/login', { email: user.email, password })).status).toBe(200);
    expect((await post('/profile/google', linkBody, token(stored))).status).toBe(409);
  });

  it.each([undefined, {}, { sub: '' }, { sub: 123 }])('refuses Google identity without a valid subject: %j', async identity => {
    const user = await account();
    google.mockResolvedValue(identity);
    expect((await post('/validate', { idToken: 'google-token' })).status).toBe(401);
    expect((await post('/profile/google', linkBody, token(user))).status).toBe(401);
  });

  it('requires a live matching session, password, and configured valid Google token', async () => {
    const user = await account();
    expect((await post('/profile/google', linkBody)).status).toBe(401);
    expect((await post('/profile/google', linkBody, token(user, { id: '' }))).status).toBe(401);
    expect((await post('/profile/google', linkBody, token(user, { id: new mongoose.Types.ObjectId().toString() }))).status).toBe(401);
    expect((await post('/profile/google', linkBody, token(user, { tokenVersion: 0 }))).status).toBe(401);
    expect((await post('/profile/google', { idToken: 'google-token' }, token(user))).status).toBe(400);
    expect((await post('/profile/google', { ...linkBody, currentPassword: 'wrong' }, token(user))).status).toBe(401);
    google.mockRejectedValue(new Error('Invalid signature'));
    expect((await post('/profile/google', linkBody, token(user))).status).toBe(401);
    delete process.env.GOOGLE_CLIENT_ID;
    expect((await post('/profile/google', linkBody, token(user))).status).toBe(403);
  });

  it('does not borrow authority from a recreated account with the same email', async () => {
    const old = await account();
    const jwt = token(old);
    await User.deleteOne({ _id: old.id });
    await account();
    expect((await post('/profile/google', linkBody, jwt)).status).toBe(401);
  });

  it('allows only one of two accounts to bind the same Google subject', async () => {
    const users = await Promise.all([account(), account('second@example.test')]);
    const results = await Promise.all(users.map(user => post('/profile/google', linkBody, token(user))));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(await User.countDocuments({ googleSubject: 'subject-1' })).toBe(1);
  });

  it('allows only one of two Google subjects to bind one account', async () => {
    const user = await account();
    google.mockImplementation(async idToken => ({ sub: idToken }));
    const results = await Promise.all(['subject-1', 'subject-2'].map(idToken => linkGoogleAccount(user.id, user.tokenVersion, password, idToken).then(() => 200, error => error.statusCode)));
    expect(results.sort()).toEqual([200, 409]);
  });

  it.each(['password', 'revocation'])('rejects a link when %s changes during password verification', async change => {
    const user = await account();
    const verify = passwords.verifyPassword;
    jest.spyOn(passwords, 'verifyPassword').mockImplementationOnce(async (...args) => {
      const result = await verify(...args);
      await User.updateOne({ _id: user.id }, change === 'password'
        ? { $set: { passwordHash: 'new-hash' } } : { $inc: { tokenVersion: 1 } });
      return result;
    });
    expect((await post('/profile/google', linkBody, token(user))).status).toBe(409);
    expect(await User.countDocuments({ googleSubject: { $exists: true } })).toBe(0);
  });

  it('fails closed for removed accounts, missing versions, and storage failures', async () => {
    const user = await account();
    await expect(linkGoogleAccount(user.id, undefined, password, 'google-token')).rejects.toMatchObject({ statusCode: 401 });
    jest.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('database unavailable'));
    await expect(linkGoogleAccount(user.id, user.tokenVersion, password, 'google-token')).rejects.toThrow('database unavailable');
    await User.deleteOne({ _id: user.id });
    await expect(linkGoogleAccount(user.id, user.tokenVersion, password, 'google-token')).rejects.toMatchObject({ statusCode: 401 });
  });

  const legacyGoogleAccount = (email = 'victim@example.test', extra = {}) => User.create({ email, signupMethod: 'google', roles: [], ...extra });
  const signIn = async () => {
    const response = await post('/validate', { idToken: 'google-token' });
    return { status: response.status, body: await response.json() };
  };

  it('signs up a new Google user bound to its subject once setup is complete', async () => {
    await account('admin@example.test');
    google.mockResolvedValue({ sub: 'subject-1', email: 'New.User@example.test', email_verified: true, given_name: 'New', family_name: 'User' });
    const first = await signIn();
    expect(first.status).toBe(200);
    const created = (await User.findOne({ email: 'new.user@example.test' }).select('+googleSubject +passwordHash'))!;
    expect(created).toMatchObject({ signupMethod: 'google', googleSubject: 'subject-1', roles: [], firstName: 'New', lastName: 'User' });
    expect(created.passwordHash).toBeUndefined();
    expect(verifyJWT(first.body.token)).toMatchObject({ id: created.id, email: 'new.user@example.test', tokenVersion: 1 });
    // Later sign-ins find the account by subject, even after Google reports another email.
    google.mockResolvedValue({ sub: 'subject-1', email: 'renamed@example.test', email_verified: true });
    expect(verifyJWT((await signIn()).body.token).id).toBe(created.id);
    expect(await User.countDocuments()).toBe(2);
  });

  it('keeps Google sign-up closed until initial setup has created the owner', async () => {
    expect((await signIn()).status).toBe(409);
    expect(await User.countDocuments()).toBe(0);
  });

  it('refuses an email Google has not verified, without creating or binding anything', async () => {
    await account('admin@example.test');
    const legacy = await legacyGoogleAccount();
    google.mockResolvedValue({ sub: 'subject-1', email: 'victim@example.test', email_verified: false });
    expect((await signIn()).status).toBe(401);
    google.mockResolvedValue({ sub: 'subject-2', email: 'someone@example.test' });
    expect((await signIn()).status).toBe(401);
    expect(await User.countDocuments()).toBe(2);
    expect((await User.findById(legacy.id).select('+googleSubject'))!.googleSubject).toBeUndefined();
  });

  it('binds a Google sign-up account from before subjects on first use, keeping its identity', async () => {
    const legacy = await legacyGoogleAccount('victim@example.test', { tokenVersion: 4 });
    const { status, body } = await signIn();
    expect(status).toBe(200);
    expect(verifyJWT(body.token)).toMatchObject({ id: legacy.id, tokenVersion: 4 });
    expect((await User.findById(legacy.id).select('+googleSubject'))!.googleSubject).toBe('subject-1');
    // Bound now: another Google account reporting the same address cannot enter it.
    google.mockResolvedValue({ sub: 'subject-2', email: 'victim@example.test', email_verified: true });
    expect((await signIn()).status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  it('never binds a Google sign-up account that has a password; its owner links deliberately', async () => {
    const legacy = await legacyGoogleAccount('victim@example.test', { passwordHash });
    expect((await signIn()).status).toBe(409);
    expect((await User.findById(legacy.id).select('+googleSubject'))!.googleSubject).toBeUndefined();
    expect((await post('/profile/google', linkBody, token(legacy))).status).toBe(200);
    expect((await signIn()).status).toBe(200);
  });

  it('creates a single account for concurrent first sign-ins', async () => {
    await account('admin@example.test');
    const results = await Promise.all([signIn(), signIn(), signIn()]);
    expect(results.map(result => result.status)).toEqual([200, 200, 200]);
    expect(new Set(results.map(result => verifyJWT(result.body.token).id)).size).toBe(1);
    expect(await User.countDocuments({ googleSubject: 'subject-1' })).toBe(1);
  });
});
