import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../../models/User';
import { getSetupStatus, login, register, setupFirstUser } from '../../controllers/authController';
import { optionalAuth } from '../../middleware/authMiddleware';
import * as passwords from '../../services/passwordService';
import { generateJWT } from '../../services/jwtService';
import { setupBodySchema } from '../../validation/authSchemas';
import { initializeBootstrap, recoverAdministrator } from '../../services/bootstrapService';

const credentials = { email: 'owner@example.test', password: 'test-password-long-enough' };
const request = (body = credentials) => ({
  body: setupBodySchema.parse(body), cookies: {}, headers: {},
}) as Request;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn(), cookie: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & typeof res;
};

describe('first-run setup with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer | undefined;
  const oldSecret = process.env.JWT_SECRET;
  const oldGroupUrl = process.env.GROUP_SERVICE_URL;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'bootstrap-integration-test-secret';
    delete process.env.GROUP_SERVICE_URL;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    await Promise.all([initializeBootstrap(), initializeBootstrap()]);
  }, 120_000);

  afterEach(async () => {
    jest.restoreAllMocks();
    if (mongoose.connection.readyState === 1) await User.deleteMany({});
  });

  afterAll(async () => {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
    if (oldGroupUrl === undefined) delete process.env.GROUP_SERVICE_URL;
    else process.env.GROUP_SERVICE_URL = oldGroupUrl;
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  it('creates exactly one administrator when different setup requests overlap', async () => {
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const hash = passwords.hashPassword;
    jest.spyOn(passwords, 'hashPassword').mockImplementation(async password => {
      const result = await hash(password);
      if (++arrivals === 2) release();
      await barrier;
      return result;
    });

    const outcomes = await Promise.allSettled([
      setupFirstUser(request(), response()),
      setupFirstUser(request({ ...credentials, email: 'second@example.test' }), response()),
    ]);

    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    expect(await User.countDocuments()).toBe(1);
    expect(await User.countDocuments({ roles: 'admin' })).toBe(1);
  });

  it('blocks registration before setup and while setup is hashing', async () => {
    await expect(register(request(), response())).rejects.toMatchObject({ statusCode: 409 });
    expect(await User.countDocuments()).toBe(0);

    let entered!: () => void;
    let release!: () => void;
    const hashing = new Promise<void>(resolve => { entered = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const hash = passwords.hashPassword;
    jest.spyOn(passwords, 'hashPassword').mockImplementation(async password => {
      entered();
      await barrier;
      return hash(password);
    });
    const setup = setupFirstUser(request(), response());
    await hashing;
    try {
      await expect(register(request({ ...credentials, email: 'member@example.test' }), response()))
        .rejects.toMatchObject({ statusCode: 409 });
      expect(await User.countDocuments()).toBe(0);
    } finally {
      release();
      await setup;
    }
    jest.restoreAllMocks();
    await register(request({ ...credentials, email: 'member@example.test' }), response());
    expect(await User.countDocuments()).toBe(2);
    expect((await User.findOne({ email: 'member@example.test' }))!.roles).toEqual([]);
  });

  it('can retry an interruption before the user insert', async () => {
    jest.spyOn(passwords, 'hashPassword').mockRejectedValueOnce(new Error('hash interrupted'));
    await expect(setupFirstUser(request(), response())).rejects.toThrow('hash interrupted');
    expect(await User.countDocuments()).toBe(0);
    jest.restoreAllMocks();

    await setupFirstUser(request(), response());
    expect(await User.countDocuments({ roles: 'admin' })).toBe(1);
  });

  it('recovers through normal login when the insert commits but its acknowledgement is lost', async () => {
    const insert = User.collection.insertOne.bind(User.collection);
    jest.spyOn(User.collection, 'insertOne').mockImplementationOnce(async (doc, options) => {
      await insert(doc, options);
      throw new Error('insert acknowledgement lost');
    });
    await expect(setupFirstUser(request(), response())).rejects.toThrow('insert acknowledgement lost');
    jest.restoreAllMocks();

    await expect(setupFirstUser(request({ ...credentials, email: 'other@example.test' }), response()))
      .rejects.toMatchObject({ statusCode: 409 });
    const res = response();
    await login(request(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, token: expect.any(String) }));
    expect(await User.countDocuments({ roles: 'admin' })).toBe(1);
  });

  it('keeps the account usable when session issuance fails after creation', async () => {
    const failedResponse = response();
    failedResponse.cookie.mockImplementation(() => { throw new Error('response interrupted'); });
    await expect(setupFirstUser(request(), failedResponse)).rejects.toThrow('response interrupted');

    const status = response();
    await getSetupStatus(request(), status);
    expect(status.json).toHaveBeenCalledWith(expect.objectContaining({ needsSetup: false }));
    await login(request(), response());
    expect(await User.countDocuments()).toBe(1);
  });

  it('keeps legacy non-admin instances closed to setup without breaking login or registration', async () => {
    const user = await User.create({
      email: credentials.email, signupMethod: 'password',
      passwordHash: await passwords.hashPassword(credentials.password), roles: [],
    });
    await expect(setupFirstUser(request(), response())).rejects.toMatchObject({ statusCode: 409 });
    await login(request(), response());
    await register(request({ ...credentials, email: 'member@example.test' }), response());
    expect((await User.findById(user._id))!.roles).toEqual([]);
  });

  it('does not recreate a missing account from an old OAuth browser session', async () => {
    const token = generateJWT({ id: new mongoose.Types.ObjectId().toString(), email: credentials.email, name: 'Old user', tokenVersion: 1 });
    const req = { cookies: { access_token: token }, headers: {} } as unknown as Request;
    const next = jest.fn();

    await optionalAuth(req, response(), next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(await User.countDocuments()).toBe(0);
  });

  it('authenticates existing Google sessions but rejects stale versions and other identities', async () => {
    const user = await User.create({ email: credentials.email, signupMethod: 'google', tokenVersion: 3 });
    const claims = { id: user._id.toString(), email: user.email, name: 'Existing user', tokenVersion: 3 };
    for (const [payload, accepted] of [
      [claims, true],
      [{ ...claims, tokenVersion: 2 }, false],
      [{ ...claims, id: new mongoose.Types.ObjectId().toString() }, false],
    ] as const) {
      const req = { cookies: {}, headers: { authorization: `Bearer ${generateJWT(payload)}` } } as Request;
      await optionalAuth(req, response(), jest.fn());
      expect(Boolean(req.user)).toBe(accepted);
    }
    expect(await User.countDocuments()).toBe(1);
    expect((await User.findById(user._id))!.lastLoginAt).toBeInstanceOf(Date);
  });

  it('recovers a legacy administrator idempotently while preserving identity and credentials', async () => {
    const user = await User.create({
      email: credentials.email, signupMethod: 'password', roles: ['reviewer'],
      passwordHash: await passwords.hashPassword(credentials.password),
    });
    await recoverAdministrator(user._id.toString());
    await recoverAdministrator(user._id.toString());

    const recovered = await User.findById(user._id).select('+passwordHash');
    expect(recovered!.roles).toEqual(['reviewer', 'admin']);
    expect(recovered!.passwordHash).toBe(user.passwordHash);
    expect(await User.countDocuments()).toBe(1);
    await login(request(), response());
    await expect(setupFirstUser(request(), response())).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses recovery for malformed or missing identities without creating an account', async () => {
    await expect(recoverAdministrator('not-an-id')).rejects.toMatchObject({ statusCode: 400 });
    await expect(recoverAdministrator(new mongoose.Types.ObjectId().toString())).rejects.toMatchObject({ statusCode: 404 });
    expect(await User.countDocuments()).toBe(0);
  });

  it('propagates index initialization failure instead of declaring setup ready', async () => {
    const error = new Error('cannot create bootstrap index');
    jest.spyOn(User, 'createIndexes').mockRejectedValueOnce(error);
    await expect(initializeBootstrap()).rejects.toBe(error);
  });

  it('uses a fresh account identity after users are reset, even when other data may remain', async () => {
    await setupFirstUser(request(), response());
    const previous = await User.findOne({});
    await User.deleteMany({});
    await setupFirstUser(request({ ...credentials, email: 'new-owner@example.test' }), response());
    const current = await User.findOne({});

    expect(current!._id.toString()).not.toBe(previous!._id.toString());
    expect(current!.bootstrapSlot).toBeUndefined();
  });
});
