jest.mock('../../oauth/models', () => ({
  OAuthClient: { findOne: jest.fn(), find: jest.fn(), create: jest.fn() },
  AuthorizationCode: { create: jest.fn(), findOneAndUpdate: jest.fn(), exists: jest.fn() },
  RefreshToken: { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), updateMany: jest.fn() }
}));

import { createHash } from 'crypto';
import { AuthorizationCode, OAuthClient, RefreshToken } from '../../oauth/models';
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

beforeEach(() => jest.clearAllMocks());

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

describe('issueRefreshToken', () => {
  it('revokes what the same client already held, so reconnecting is not a second grant', async () => {
    refresh.updateMany.mockResolvedValue({ modifiedCount: 1 });
    refresh.create.mockResolvedValue({});

    const { token } = await issueRefreshToken({
      clientId: 'vsn-client-abc',
      userId: 'u1',
      scopes: ['vision:read'],
      resource: 'https://mcp.visin.eu'
    });

    expect(refresh.updateMany).toHaveBeenCalledWith(
      { userId: 'u1', clientId: 'vsn-client-abc', revokedAt: { $exists: false } },
      { $set: { revokedAt: expect.any(Date) } }
    );
    // Only the digest is stored.
    expect(refresh.create.mock.calls[0][0].tokenHash).toBe(sha256(token));
    expect(JSON.stringify(refresh.create.mock.calls[0][0])).not.toContain(token);
  });
});

describe('redeemRefreshToken', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    _id: 'rt1',
    tokenHash: sha256('the-token'),
    clientId: 'vsn-client-abc',
    userId: 'u1',
    scopes: ['vision:read'],
    resource: 'https://mcp.visin.eu',
    grantedAt: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    revokedAt: undefined as Date | undefined,
    lastUsedAt: undefined as Date | undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...over
  });

  it('rotates: the presented token dies and a fresh one is issued', async () => {
    const record = stored();
    refresh.findOne.mockResolvedValue(record);
    refresh.create.mockResolvedValue({});

    const result = await redeemRefreshToken('the-token', 'vsn-client-abc');

    expect(result.ok).toBe(true);
    expect(record.revokedAt).toBeInstanceOf(Date);
    expect(record.save).toHaveBeenCalled();
    expect(result.rotatedToken).toEqual(expect.any(String));
    expect(refresh.create.mock.calls[0][0].tokenHash).toBe(sha256(result.rotatedToken as string));
  });

  it('carries the original grant date through a rotation', async () => {
    // Otherwise the connections page tells someone they connected Claude a
    // minute ago when they did it in March.
    refresh.findOne.mockResolvedValue(stored());
    refresh.create.mockResolvedValue({});

    await redeemRefreshToken('the-token', 'vsn-client-abc');

    expect(refresh.create.mock.calls[0][0].grantedAt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
  });

  it('carries the scopes through, rather than re-deriving them', async () => {
    refresh.findOne.mockResolvedValue(stored({ scopes: ['vision:read', 'dataset:read'] }));
    refresh.create.mockResolvedValue({});

    const result = await redeemRefreshToken('the-token', 'vsn-client-abc');

    expect(result.scopes).toEqual(['vision:read', 'dataset:read']);
    expect(refresh.create.mock.calls[0][0].scopes).toEqual(['vision:read', 'dataset:read']);
  });

  it('treats reuse of a rotated token as theft and cuts the whole grant', async () => {
    // The honest client and whoever copied the token now both hold tokens from
    // the same grant, and there is no telling which just called.
    refresh.findOne.mockResolvedValue(stored({ revokedAt: new Date() }));
    refresh.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const result = await redeemRefreshToken('the-token', 'vsn-client-abc');

    expect(result).toEqual({ ok: false, reused: true });
    expect(refresh.updateMany).toHaveBeenCalledWith(
      { userId: 'u1', clientId: 'vsn-client-abc', revokedAt: { $exists: false } },
      { $set: { revokedAt: expect.any(Date) } }
    );
    expect(refresh.create).not.toHaveBeenCalled();
  });

  it('rejects a token that does not belong to the presenting client', async () => {
    refresh.findOne.mockResolvedValue(null);

    await expect(redeemRefreshToken('the-token', 'another-client')).resolves.toEqual({ ok: false });
    expect(refresh.findOne).toHaveBeenCalledWith({
      tokenHash: sha256('the-token'),
      clientId: 'another-client'
    });
  });

  it('falls back to createdAt for a record predating grantedAt', async () => {
    refresh.findOne.mockResolvedValue(stored({ grantedAt: undefined }));
    refresh.create.mockResolvedValue({});

    await redeemRefreshToken('the-token', 'vsn-client-abc');

    expect(refresh.create.mock.calls[0][0].grantedAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });
});

describe('revokeRefreshTokensForUser', () => {
  it('cuts one app when given a client id', async () => {
    refresh.updateMany.mockResolvedValue({ modifiedCount: 1 });

    await expect(revokeRefreshTokensForUser('u1', 'vsn-client-abc')).resolves.toBe(1);
    expect(refresh.updateMany.mock.calls[0][0]).toEqual({
      userId: 'u1',
      revokedAt: { $exists: false },
      clientId: 'vsn-client-abc'
    });
  });

  it('cuts every app when given none', async () => {
    refresh.updateMany.mockResolvedValue({ modifiedCount: 3 });

    await expect(revokeRefreshTokensForUser('u1')).resolves.toBe(3);
    expect(refresh.updateMany.mock.calls[0][0]).toEqual({
      userId: 'u1',
      revokedAt: { $exists: false }
    });
  });
});

describe('listConnections', () => {
  it('names each app and reports when the grant was made, not when it last rotated', async () => {
    refresh.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: 'rt1',
          clientId: 'vsn-client-abc',
          scopes: ['vision:read'],
          grantedAt: new Date('2026-03-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          lastUsedAt: new Date('2026-09-04T00:00:00.000Z'),
          revokedAt: undefined
        }
      ])
    });
    client.find.mockResolvedValue([{ clientId: 'vsn-client-abc', clientName: 'Claude' }]);

    const [connection] = await listConnections('u1');

    expect(connection).toEqual({
      id: 'rt1',
      clientId: 'vsn-client-abc',
      clientName: 'Claude',
      scopes: ['vision:read'],
      createdAt: '2026-03-01T00:00:00.000Z',
      lastRenewedAt: '2026-09-04T00:00:00.000Z',
      revokedAt: null
    });
  });

  it('still lists a grant whose client record has gone', async () => {
    refresh.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: 'rt1',
          clientId: 'vsn-client-gone',
          scopes: [],
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          revokedAt: new Date('2026-09-05T00:00:00.000Z')
        }
      ])
    });
    client.find.mockResolvedValue([]);

    const [connection] = await listConnections('u1');

    expect(connection.clientName).toBe('Unknown app');
    expect(connection.lastRenewedAt).toBeNull();
    expect(connection.revokedAt).toBe('2026-09-05T00:00:00.000Z');
  });
});
