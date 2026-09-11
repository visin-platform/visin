jest.mock('../../oauth/models', () => ({
  OAuthClient: { findOne: jest.fn(), find: jest.fn(), create: jest.fn() },
  AuthorizationCode: { create: jest.fn(), findOneAndUpdate: jest.fn(), exists: jest.fn() },
  RefreshToken: { findOne: jest.fn(), create: jest.fn() },
  OAuthGrant: { findOne: jest.fn(), find: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() }
}));

import { createHash } from 'crypto';
import { AuthorizationCode, OAuthClient, OAuthGrant, RefreshToken } from '../../oauth/models';
import {
  findClient,
  isRegisteredRedirect,
  issueAuthorizationCode,
  issueRefreshToken,
  listConnections,
  redeemAuthorizationCode,
  redeemRefreshToken,
  registerClient,
  revokeRefreshTokensForUser
} from '../../oauth/service';

const client = OAuthClient as unknown as Record<string, jest.Mock>;
const code = AuthorizationCode as unknown as Record<string, jest.Mock>;
const refresh = RefreshToken as unknown as Record<string, jest.Mock>;
const grant = OAuthGrant as unknown as Record<string, jest.Mock>;

const VERIFIER = 'a-code-verifier-long-enough-to-be-real';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const storedCode = (over: Record<string, unknown> = {}) => ({
  code: 'the-code',
  clientId: 'vsn-client-abc',
  userId: 'u1',
  redirectUri: 'https://claude.ai/callback',
  scopes: ['vision:read'],
  resource: 'https://mcp.visin.eu',
  codeChallenge: CHALLENGE,
  expiresAt: new Date(Date.now() + 60_000),
  ...over
});

beforeEach(() => jest.resetAllMocks());

describe('registerClient', () => {
  it('reuses the client already registered for the same callback URLs', async () => {
    // Claude re-registers on every connect attempt; minting a fresh id each
    // time leaves a user staring at identical entries, only one of which any
    // given disconnect cuts off.
    client.findOne.mockResolvedValue({
      clientId: 'vsn-client-existing',
      clientName: 'Claude',
      redirectUris: ['https://claude.ai/callback']
    });

    const registered = await registerClient({
      clientName: 'Claude',
      redirectUris: ['https://claude.ai/callback']
    });

    expect(registered.clientId).toBe('vsn-client-existing');
    expect(client.create).not.toHaveBeenCalled();
  });

  it('matches on the exact set of URIs, in any order', async () => {
    client.findOne.mockResolvedValue(null);
    client.create.mockImplementation((doc: Record<string, unknown>) => Promise.resolve(doc));

    await registerClient({ clientName: 'X', redirectUris: ['https://b/cb', 'https://a/cb'] });

    expect(client.findOne).toHaveBeenCalledWith({
      redirectUris: { $size: 2, $all: ['https://a/cb', 'https://b/cb'] }
    });
  });

  it('mints a new client when nothing matches', async () => {
    client.findOne.mockResolvedValue(null);
    client.create.mockImplementation((doc: Record<string, unknown>) => Promise.resolve(doc));

    const registered = await registerClient({
      clientName: 'Claude',
      redirectUris: ['https://claude.ai/callback']
    });

    expect(registered.clientId).toMatch(/^vsn-client-[0-9a-f]{32}$/);
  });

  it('caps a client name rather than storing whatever was sent', async () => {
    client.findOne.mockResolvedValue(null);
    client.create.mockImplementation((doc: Record<string, unknown>) => Promise.resolve(doc));

    const registered = await registerClient({ clientName: 'x'.repeat(500), redirectUris: ['https://a/cb'] });

    expect(registered.clientName).toHaveLength(200);
  });
});

describe('isRegisteredRedirect', () => {
  it('matches exactly, never by prefix', () => {
    // Prefix or wildcard matching is the classic way an authorization code
    // ends up delivered somewhere the client never controlled.
    const registered = { redirectUris: ['https://claude.ai/callback'] };

    expect(isRegisteredRedirect(registered, 'https://claude.ai/callback')).toBe(true);
    expect(isRegisteredRedirect(registered, 'https://claude.ai/callback/evil')).toBe(false);
    expect(isRegisteredRedirect(registered, 'https://claude.ai/callback?x=1')).toBe(false);
    expect(isRegisteredRedirect(registered, 'https://evil.com/callback')).toBe(false);
  });
});

describe('findClient', () => {
  it('looks a client up by its id', async () => {
    client.findOne.mockResolvedValue({ clientId: 'vsn-client-abc' });
    await findClient('vsn-client-abc');
    expect(client.findOne).toHaveBeenCalledWith({ clientId: 'vsn-client-abc' });
  });
});

describe('issueAuthorizationCode', () => {
  it('stores what was approved, with a short life', async () => {
    code.create.mockResolvedValue({});

    const issued = await issueAuthorizationCode({
      clientId: 'vsn-client-abc',
      userId: 'u1',
      userEmail: 'a@b.com',
      userName: 'A B',
      redirectUri: 'https://claude.ai/callback',
      scopes: ['vision:read'],
      resource: 'https://mcp.visin.eu',
      codeChallenge: CHALLENGE
    });

    expect(issued).toEqual(expect.any(String));
    const stored = code.create.mock.calls[0][0];
    expect(stored.scopes).toEqual(['vision:read']);
    const ttl = stored.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(50_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});

describe('redeemAuthorizationCode', () => {
  it('exchanges a valid code and returns what was approved', async () => {
    code.findOneAndUpdate.mockResolvedValue(storedCode());

    const result = await redeemAuthorizationCode(
      'the-code',
      'vsn-client-abc',
      'https://claude.ai/callback',
      VERIFIER
    );

    expect(result.ok).toBe(true);
    expect(result.code?.scopes).toEqual(['vision:read']);
  });

  it('marks the code used in the same atomic update that fetches it', async () => {
    // Two simultaneous exchanges must not both succeed; a replay has to lose a
    // race rather than be caught by a check that ran a moment earlier.
    code.findOneAndUpdate.mockResolvedValue(storedCode());

    await redeemAuthorizationCode('the-code', 'vsn-client-abc', 'https://claude.ai/callback', VERIFIER);

    expect(code.findOneAndUpdate).toHaveBeenCalledWith(
      { code: 'the-code', usedAt: { $exists: false } },
      { $set: { usedAt: expect.any(Date) } },
      { new: true }
    );
  });

  it('rejects a replayed code, distinguishing it from an unknown one in the log', async () => {
    code.findOneAndUpdate.mockResolvedValue(null);
    code.exists.mockResolvedValue({ _id: 'x' });

    await expect(
      redeemAuthorizationCode('the-code', 'vsn-client-abc', 'https://claude.ai/callback', VERIFIER)
    ).resolves.toEqual({ ok: false, rejection: 'already-used' });
  });

  it('rejects a code that never existed', async () => {
    code.findOneAndUpdate.mockResolvedValue(null);
    code.exists.mockResolvedValue(null);

    await expect(
      redeemAuthorizationCode('nope', 'vsn-client-abc', 'https://claude.ai/callback', VERIFIER)
    ).resolves.toEqual({ ok: false, rejection: 'unknown' });
  });

  it('rejects a wrong PKCE verifier', async () => {
    // The whole reason a public client is safe: an intercepted code is useless
    // without the verifier that never left the client.
    code.findOneAndUpdate.mockResolvedValue(storedCode());

    await expect(
      redeemAuthorizationCode(
        'the-code',
        'vsn-client-abc',
        'https://claude.ai/callback',
        'the-wrong-verifier-entirely'
      )
    ).resolves.toEqual({ ok: false, rejection: 'pkce-failed' });
  });

  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 1000) }, 'expired'],
    ['issued to another client', { clientId: 'someone-else' }, 'client-mismatch'],
    ['bound to another redirect', { redirectUri: 'https://evil.com/cb' }, 'redirect-mismatch']
  ])('rejects a code that is %s', async (_label, override, rejection) => {
    code.findOneAndUpdate.mockResolvedValue(storedCode(override));

    await expect(
      redeemAuthorizationCode('the-code', 'vsn-client-abc', 'https://claude.ai/callback', VERIFIER)
    ).resolves.toEqual({ ok: false, rejection });
  });
});

const input = { clientId: 'vsn-client-abc', userId: 'u1', scopes: ['vision:read'] as const, resource: 'https://mcp.visin.eu' };
const activeGrant = () => ({
  _id: 'grant', generation: 'generation', currentTokenHash: sha256('the-token'),
  ...input, grantedAt: new Date('2026-03-01T00:00:00.000Z')
});

describe('issueRefreshToken', () => {
  it('prepares only a digest and atomically replaces the authoritative grant on reconnect', async () => {
    const { token } = await issueRefreshToken({ ...input, scopes: [...input.scopes] });
    const history = refresh.create.mock.calls[0][0];
    expect(history.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(history)).not.toContain(token);
    expect(grant.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: sha256(JSON.stringify([input.userId, input.clientId])) },
      {
        $set: { ...input, generation: history.generation, currentTokenHash: sha256(token), grantedAt: expect.any(Date) },
        $unset: { revokedAt: 1, lastUsedAt: 1 }
      },
      { upsert: true, returnDocument: 'after' }
    );
    expect(refresh.create.mock.invocationCallOrder[0]).toBeLessThan(grant.findOneAndUpdate.mock.invocationCallOrder[0]);
  });

  it('does not replace a connection when history preparation fails', async () => {
    refresh.create.mockRejectedValue(new Error('storage unavailable'));
    await expect(issueRefreshToken({ ...input, scopes: [...input.scopes] })).rejects.toThrow('storage unavailable');
    expect(grant.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('redeemRefreshToken', () => {
  beforeEach(() => {
    refresh.findOne.mockResolvedValue({ tokenHash: sha256('the-token'), clientId: input.clientId, grantId: 'grant', generation: 'generation' });
    grant.findOne.mockResolvedValue(activeGrant());
    grant.findOneAndUpdate.mockResolvedValue(activeGrant());
  });

  it('rotates once, preserving approved scopes/resource and the original grant date', async () => {
    const result = await redeemRefreshToken('the-token', input.clientId);
    expect(result).toEqual({ ok: true, userId: input.userId, scopes: input.scopes, resource: input.resource, rotatedToken: expect.any(String) });
    expect(refresh.findOne).toHaveBeenCalledWith({ tokenHash: sha256('the-token'), clientId: input.clientId }, undefined, { readPreference: 'primary' });
    expect(grant.findOne).toHaveBeenCalledWith({ _id: 'grant', generation: 'generation' }, undefined, { readPreference: 'primary' });
    expect(refresh.create).toHaveBeenCalledWith({ tokenHash: sha256(result.rotatedToken!), clientId: input.clientId, grantId: 'grant', generation: 'generation' });
    expect(grant.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'grant', generation: 'generation', currentTokenHash: sha256('the-token'), revokedAt: { $exists: false } },
      { $set: { currentTokenHash: sha256(result.rotatedToken!), lastUsedAt: expect.any(Date) } },
      { returnDocument: 'after' }
    );
    expect(refresh.create.mock.invocationCallOrder[0]).toBeLessThan(grant.findOneAndUpdate.mock.invocationCallOrder[0]);
  });

  it.each([null, {}, { grantId: 'grant' }])('rejects unknown or legacy history without revoking anything (%j)', async record => {
    refresh.findOne.mockResolvedValue(record);
    await expect(redeemRefreshToken('the-token', 'other-client')).resolves.toEqual({ ok: false });
    expect(grant.findOne).not.toHaveBeenCalled();
    expect(grant.updateOne).not.toHaveBeenCalled();
  });

  it.each([null, { ...activeGrant(), revokedAt: new Date() }])('rejects missing, replaced or disconnected grants (%j)', async record => {
    grant.findOne.mockResolvedValue(record);
    await expect(redeemRefreshToken('the-token', input.clientId)).resolves.toEqual({ ok: false });
    expect(refresh.create).not.toHaveBeenCalled();
    expect(grant.updateOne).not.toHaveBeenCalled();
  });

  it.each(['retired', 'concurrent'])('revokes only the original generation for %s replay', async mode => {
    if (mode === 'retired') grant.findOne.mockResolvedValue({ ...activeGrant(), currentTokenHash: 'successor' });
    else grant.findOneAndUpdate.mockResolvedValue(null);
    await expect(redeemRefreshToken('the-token', input.clientId)).resolves.toEqual({ ok: false, reused: true });
    expect(grant.updateOne).toHaveBeenCalledWith(
      { _id: 'grant', generation: 'generation', revokedAt: { $exists: false } },
      { $set: { revokedAt: expect.any(Date) } }
    );
    if (mode === 'retired') expect(refresh.create).not.toHaveBeenCalled();
  });

  it('leaves the current token usable when successor preparation fails', async () => {
    refresh.create.mockRejectedValue(new Error('storage unavailable'));
    await expect(redeemRefreshToken('the-token', input.clientId)).rejects.toThrow('storage unavailable');
    expect(grant.findOneAndUpdate).not.toHaveBeenCalled();
    expect(grant.updateOne).not.toHaveBeenCalled();
  });
});

describe('revokeRefreshTokensForUser', () => {
  it('cuts one app when given a client id', async () => {
    grant.updateMany.mockResolvedValue({ modifiedCount: 1 });
    await expect(revokeRefreshTokensForUser('u1', input.clientId)).resolves.toBe(1);
    expect(grant.updateMany).toHaveBeenCalledWith(
      { userId: 'u1', revokedAt: { $exists: false }, clientId: input.clientId },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });

  it('cuts every app when given none', async () => {
    grant.updateMany.mockResolvedValue({ modifiedCount: 3 });
    await expect(revokeRefreshTokensForUser('u1')).resolves.toBe(3);
    expect(grant.updateMany.mock.calls[0][0]).toEqual({ userId: 'u1', revokedAt: { $exists: false } });
  });
});

describe('listConnections', () => {
  it('lists authoritative connections, their approval date and last refresh', async () => {
    grant.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([
      { ...activeGrant(), lastUsedAt: new Date('2026-09-04T00:00:00.000Z') }
    ]) });
    client.find.mockResolvedValue([{ clientId: input.clientId, clientName: 'Claude' }]);
    expect(await listConnections('u1')).toEqual([{
      id: 'grant', clientId: input.clientId, clientName: 'Claude', scopes: input.scopes,
      createdAt: '2026-03-01T00:00:00.000Z', lastRenewedAt: '2026-09-04T00:00:00.000Z', revokedAt: null
    }]);
    expect(grant.find).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('still lists a disconnected grant whose client record has gone', async () => {
    grant.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([
      { ...activeGrant(), revokedAt: new Date('2026-09-05T00:00:00.000Z') }
    ]) });
    client.find.mockResolvedValue([]);
    const [connection] = await listConnections('u1');
    expect(connection.clientName).toBe('Unknown app');
    expect(connection.lastRenewedAt).toBeNull();
    expect(connection.revokedAt).toBe('2026-09-05T00:00:00.000Z');
  });
});
