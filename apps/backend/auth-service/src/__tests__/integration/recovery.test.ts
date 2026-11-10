import { createHash } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { User } from '../../models/User';
import { Session } from '../../models/Session';
import { recoverAccount } from '../../controllers/recoveryController';
import { verifyPassword } from '../../services/passwordService';
describe('one-use account recovery', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  let userId: string;
  const token = 'a'.repeat(64);
  const password = 'replacement-password-123';
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.post('/recover', recoverAccount);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/recover`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await User.deleteMany({});
    const user = await User.create({
      email: 'recover@example.test',
      signupMethod: 'password',
      roles: [],
      recoveryHash: createHash('sha256').update(token).digest('hex'),
      recoveryExpiresAt: new Date(Date.now() + 1800000)
    });
    userId = user.id;
  });
  const submit = (body: unknown) =>
    fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  it('atomically replaces the password once and revokes existing sessions', async () => {
    const now = new Date();
    await Session.create({
      userId,
      method: 'password',
      lastSeenAt: now,
      expiresAt: new Date(Date.now() + 3600000),
      absoluteExpiresAt: new Date(Date.now() + 3600000)
    });
    const results = await Promise.all([submit({ token, password }), submit({ token, password })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const user = await User.findById(userId).select('+passwordHash +recoveryHash');
    expect(await verifyPassword(password, user?.passwordHash)).toBe(true);
    expect(user?.recoveryHash).toBeUndefined();
    expect(user?.tokenVersion).toBe(2);
    expect(user?.credentialsRevokedAt).toBeInstanceOf(Date);
    expect(await Session.countDocuments({ userId })).toBe(0);
  });
  it('rejects expired links and suspended accounts', async () => {
    await User.updateOne({ _id: userId }, { $set: { recoveryExpiresAt: new Date(0) } });
    expect((await submit({ token, password })).status).toBe(400);
    await User.updateOne(
      { _id: userId },
      { $set: { recoveryExpiresAt: new Date(Date.now() + 100000), status: 'suspended' } }
    );
    expect((await submit({ token, password })).status).toBe(400);
  });
  it.each([{}, { token: 'invalid', password }, { token, password: 'short' }, { token, password: 'x'.repeat(201) }])(
    'rejects malformed recovery input',
    async (body) => {
      expect((await submit(body)).status).toBe(400);
    }
  );
});
