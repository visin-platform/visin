import express from 'express';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  OAuthClient, OAuthGrant, RefreshToken, issueRefreshToken, redeemRefreshToken,
  revokeRefreshTokensForUser, listConnections, errorHandler
} from '@visin/backend-core';
import { token } from '../../controllers/oauthController';

const input = { userId: 'owner', clientId: 'client', scopes: ['vision:read' as const], resource: 'https://mcp.visin.eu' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

/** Hold real database writes after history exists but before it can gain authority. */
const pausePreparation = (writers = 1) => {
  const ready = deferred();
  const release = deferred();
  const original = RefreshToken.create;
  let arrived = 0;
  const spy = jest.spyOn(RefreshToken, 'create').mockImplementation((async (...args: unknown[]) => {
    const row = await Reflect.apply(original, RefreshToken, args);
    if (++arrived <= writers) {
      if (arrived === writers) ready.resolve();
      await release.promise;
    }
    return row;
  }) as typeof RefreshToken.create);
  return { ready: ready.promise, release: release.resolve, restore: () => spy.mockRestore() };
};

describe('OAuth refresh grant authority on standalone MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const previous = { ...process.env };
  beforeAll(async () => {
    process.env.JWT_SECRET = 'oauth-rotation-test-secret';
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    await Promise.all([OAuthGrant.init(), RefreshToken.init(), OAuthClient.init()]);
    const app = express();
    app.use(express.json());
    app.post('/oauth/token', token);
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 120_000);
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([OAuthGrant.deleteMany({}), RefreshToken.deleteMany({}), OAuthClient.deleteMany({})]);
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    process.env = previous;
  });
  const refresh = (value: string, clientId = input.clientId) => fetch(`${base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: value, client_id: clientId })
  });

  it('preserves token response, approved permissions and one stable connection through rotations', async () => {
    await OAuthClient.create({ clientId: input.clientId, clientName: 'Test app', redirectUris: ['https://app.test/cb'] });
    const issued = await issueRefreshToken(input);
    const [before] = await listConnections(input.userId);
    const response = await refresh(issued.token);
    expect(response.status).toBe(200);
    const body = await response.json() as { refresh_token: string; access_token: string };
    expect(body).toMatchObject({ token_type: 'Bearer', scope: 'vision:read', expires_in: 3600 });
    expect(body.refresh_token).not.toBe(issued.token);
    expect(body.access_token).toEqual(expect.any(String));
    const [after] = await listConnections(input.userId);
    expect(after).toMatchObject({ id: before.id, createdAt: before.createdAt, scopes: input.scopes, clientName: 'Test app', revokedAt: null });
    expect(after.lastRenewedAt).not.toBeNull();
    expect(await listConnections(input.userId)).toHaveLength(1);
    expect((await refresh(body.refresh_token)).status).toBe(200);
  });

  it('gives concurrent HTTP redemptions one winner and revokes all descendants on reuse', async () => {
    const issued = await issueRefreshToken(input);
    const pause = pausePreparation(2);
    const requests = [refresh(issued.token), refresh(issued.token)];
    await pause.ready;
    pause.release();
    const responses = await Promise.all(requests);
    expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
    const winner = await responses.find(response => response.status === 200)!.json() as { refresh_token: string };
    expect((await refresh(winner.refresh_token)).status).toBe(400);
    expect((await listConnections(input.userId))[0].revokedAt).not.toBeNull();
  });

  it.each(['disconnect', 'reconnect'] as const)('cannot activate a prepared refresh after %s', async action => {
    const issued = await issueRefreshToken(input);
    const pause = pausePreparation();
    const pending = redeemRefreshToken(issued.token, input.clientId);
    await pause.ready;
    pause.restore();
    let replacement: string | undefined;
    if (action === 'disconnect') expect(await revokeRefreshTokensForUser(input.userId, input.clientId)).toBe(1);
    else replacement = (await issueRefreshToken({ ...input, scopes: ['dataset:read'] })).token;
    pause.release();
    expect((await pending).ok).toBe(false);
    if (replacement) {
      expect(await redeemRefreshToken(replacement, input.clientId)).toMatchObject({ ok: true, scopes: ['dataset:read'] });
    } else {
      expect((await listConnections(input.userId))[0].revokedAt).not.toBeNull();
    }
  });

  it('does not let retired-generation replay disconnect a newly approved grant', async () => {
    const old = await issueRefreshToken(input);
    const rotated = await redeemRefreshToken(old.token, input.clientId);
    const fresh = await issueRefreshToken(input);
    expect((await redeemRefreshToken(old.token, input.clientId)).ok).toBe(false);
    expect((await redeemRefreshToken(rotated.rotatedToken!, input.clientId)).ok).toBe(false);
    expect((await redeemRefreshToken(fresh.token, input.clientId)).ok).toBe(true);
  });

  it('keeps delayed replay revocation confined to its original generation', async () => {
    const old = await issueRefreshToken(input);
    await redeemRefreshToken(old.token, input.clientId);
    const original = OAuthGrant.updateOne;
    const ready = deferred();
    const release = deferred();
    jest.spyOn(OAuthGrant, 'updateOne').mockImplementationOnce((async (...args: unknown[]) => {
      ready.resolve();
      await release.promise;
      return Reflect.apply(original, OAuthGrant, args);
    }) as unknown as typeof OAuthGrant.updateOne);
    const replay = redeemRefreshToken(old.token, input.clientId);
    await ready.promise;
    const fresh = await issueRefreshToken(input);
    release.resolve();
    expect(await replay).toMatchObject({ ok: false, reused: true });
    expect((await redeemRefreshToken(fresh.token, input.clientId)).ok).toBe(true);
  });

  it('gives concurrent reconnects only one active generation', async () => {
    // Start with a connection so this also covers replacing existing authority.
    await issueRefreshToken(input);
    const pause = pausePreparation(2);
    const requests = [issueRefreshToken(input), issueRefreshToken(input)];
    await pause.ready;
    pause.release();
    const issued = await Promise.all(requests);
    const results = await Promise.all(issued.map(value => redeemRefreshToken(value.token, input.clientId)));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(await OAuthGrant.countDocuments({})).toBe(1);
    expect(await listConnections(input.userId)).toHaveLength(1);
  });

  it('orders an explicit reconnect and disconnect at their atomic grant writes', async () => {
    await issueRefreshToken(input);
    const pause = pausePreparation();
    const reconnect = issueRefreshToken(input);
    await pause.ready;
    expect(await revokeRefreshTokensForUser(input.userId, input.clientId)).toBe(1);
    pause.release();
    const fresh = await reconnect;
    expect((await redeemRefreshToken(fresh.token, input.clientId)).ok).toBe(true);
    expect(await revokeRefreshTokensForUser(input.userId, input.clientId)).toBe(1);
    expect((await listConnections(input.userId))[0].revokedAt).not.toBeNull();
  });

  it.each(['refresh', 'reconnect'] as const)('preserves the existing token if %s preparation fails', async action => {
    const issued = await issueRefreshToken(input);
    jest.spyOn(RefreshToken, 'create').mockRejectedValueOnce(new Error('write failed'));
    const operation = action === 'refresh' ? redeemRefreshToken(issued.token, input.clientId) : issueRefreshToken(input);
    await expect(operation).rejects.toThrow('write failed');
    expect((await redeemRefreshToken(issued.token, input.clientId)).ok).toBe(true);
  });

  it('leaves prepared history inert when activation fails, and permits retry', async () => {
    const issued = await issueRefreshToken(input);
    jest.spyOn(OAuthGrant, 'findOneAndUpdate').mockRejectedValueOnce(new Error('activation failed'));
    await expect(redeemRefreshToken(issued.token, input.clientId)).rejects.toThrow('activation failed');
    expect(await RefreshToken.countDocuments({})).toBe(2);
    expect((await listConnections(input.userId))[0].lastRenewedAt).toBeNull();
    expect((await redeemRefreshToken(issued.token, input.clientId)).ok).toBe(true);
  });

  it('fails closed after a committed rotation loses its acknowledgement and recovers by reconnecting', async () => {
    const issued = await issueRefreshToken(input);
    const original = OAuthGrant.findOneAndUpdate;
    jest.spyOn(OAuthGrant, 'findOneAndUpdate').mockImplementationOnce((async (...args: unknown[]) => {
      await Reflect.apply(original, OAuthGrant, args);
      throw new Error('acknowledgement lost');
    }) as unknown as typeof OAuthGrant.findOneAndUpdate);
    await expect(redeemRefreshToken(issued.token, input.clientId)).rejects.toThrow('acknowledgement lost');
    expect(await redeemRefreshToken(issued.token, input.clientId)).toMatchObject({ ok: false, reused: true });
    const fresh = await issueRefreshToken(input);
    expect((await redeemRefreshToken(fresh.token, input.clientId)).ok).toBe(true);
  });

  it('does not let unknown, wrong-client or legacy tokens revoke valid grants', async () => {
    const issued = await issueRefreshToken(input);
    expect((await refresh(issued.token, 'other-client')).status).toBe(400);
    expect((await refresh('unknown')).status).toBe(400);
    await RefreshToken.collection.insertOne({ tokenHash: hash('legacy'), clientId: input.clientId, userId: input.userId });
    expect((await refresh('legacy')).status).toBe(400);
    expect((await refresh(issued.token)).status).toBe(200);
  });

  it('scopes disconnect to the requested user and client, including after rotation', async () => {
    const first = await issueRefreshToken(input);
    const rotated = await redeemRefreshToken(first.token, input.clientId);
    const otherClient = await issueRefreshToken({ ...input, clientId: 'other' });
    const otherUser = await issueRefreshToken({ ...input, userId: 'other' });
    expect(await revokeRefreshTokensForUser(input.userId, input.clientId)).toBe(1);
    expect((await redeemRefreshToken(rotated.rotatedToken!, input.clientId)).ok).toBe(false);
    expect((await redeemRefreshToken(otherClient.token, 'other')).ok).toBe(true);
    expect((await redeemRefreshToken(otherUser.token, input.clientId)).ok).toBe(true);
    expect(await revokeRefreshTokensForUser(input.userId)).toBe(1);
    expect(await revokeRefreshTokensForUser('other')).toBe(1);
  });
});
