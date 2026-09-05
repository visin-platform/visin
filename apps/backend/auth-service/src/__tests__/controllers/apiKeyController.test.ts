import type { Request, Response } from 'express';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  createApiKey: jest.fn(),
  listApiKeys: jest.fn(),
  revealApiKey: jest.fn(),
  revokeApiKey: jest.fn(),
  deleteApiKey: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  revealApiKey,
  revokeApiKey,
} from '@visin/backend-core';
import {
  createKey,
  listKeys,
  removeKey,
  revealKey,
  revokeKey,
} from '../../controllers/apiKeyController';

const mocked = {
  create: createApiKey as unknown as jest.Mock,
  list: listApiKeys as unknown as jest.Mock,
  reveal: revealApiKey as unknown as jest.Mock,
  revoke: revokeApiKey as unknown as jest.Mock,
  remove: deleteApiKey as unknown as jest.Mock,
};

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    body: {},
    params: {},
    user: { id: 'u1', email: 'a@b.com', name: 'A B' },
    ...overrides,
  }) as unknown as Request;

const summary = {
  id: 'k1',
  name: 'Claude Code',
  prefix: 'vsn_live_0123456789ab',
  scopes: ['vision:read'],
  createdAt: '2026-09-01T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.API_KEY_ENCRYPTION_SECRET = 'a-test-secret';
});

afterAll(() => delete process.env.API_KEY_ENCRYPTION_SECRET);

describe('when the deployment has not enabled API keys', () => {
  beforeEach(() => delete process.env.API_KEY_ENCRYPTION_SECRET);

  it.each([
    ['createKey', createKey],
    ['revealKey', revealKey],
  ])('%s answers 501 with something actionable, not a 500 from inside scrypt', async (_name, handler) => {
    const res = makeRes();

    await handler(makeReq({ body: { name: 'k', scopes: ['vision:read'] } }), res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json.mock.calls[0][0].message).toContain('API_KEY_ENCRYPTION_SECRET');
    expect(mocked.create).not.toHaveBeenCalled();
    expect(mocked.reveal).not.toHaveBeenCalled();
  });

  it('still lists and revokes, which need no encryption secret', async () => {
    // Verification and revocation run off the digest; only the recoverable copy
    // needs the secret. A deployment that lost it must still be able to turn a
    // key off.
    mocked.list.mockResolvedValue([summary]);
    mocked.revoke.mockResolvedValue(summary);

    const listRes = makeRes();
    await listKeys(makeReq(), listRes);
    expect(listRes.json).toHaveBeenCalledWith({ success: true, data: [summary] });

    const revokeRes = makeRes();
    await revokeKey(makeReq({ params: { id: 'k1' } }), revokeRes);
    expect(mocked.revoke).toHaveBeenCalledWith('u1', 'k1');
  });
});

describe('createKey', () => {
  it('returns the token once, alongside the summary', async () => {
    mocked.create.mockResolvedValue({ summary, token: 'vsn_live_0123456789ab_secret' });
    const res = makeRes();

    await createKey(
      makeReq({ body: { name: 'Claude Code', scopes: ['vision:read', 'dataset:read'] } }),
      res
    );

    expect(mocked.create).toHaveBeenCalledWith({
      userId: 'u1',
      userEmail: 'a@b.com',
      userName: 'A B',
      name: 'Claude Code',
      scopes: ['vision:read', 'dataset:read'],
      expiresAt: null,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.token).toBe('vsn_live_0123456789ab_secret');
  });

  it('refuses a key that would reach nothing', async () => {
    // It would authenticate and then be refused every route — a confusing way
    // to find out a form was filled in wrong.
    await expect(createKey(makeReq({ body: { name: 'k', scopes: [] } }), makeRes())).rejects.toThrow(
      /at least one permission/
    );
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it('turns an expiry in days into a date', async () => {
    mocked.create.mockResolvedValue({ summary, token: 't' });

    await createKey(
      makeReq({ body: { name: 'k', scopes: ['vision:read'], expiresInDays: 30 } }),
      makeRes()
    );

    const { expiresAt } = mocked.create.mock.calls[0][0];
    const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(30, 1);
  });

  it('snapshots the name from the database record when there is one', async () => {
    mocked.create.mockResolvedValue({ summary, token: 't' });

    await createKey(
      makeReq({
        user: { id: 'u1', email: 'a@b.com' },
        dbUser: { email: 'a@b.com', firstName: 'Ada', lastName: 'Lovelace' },
        body: { name: 'k', scopes: ['vision:read'] },
      }),
      makeRes()
    );

    expect(mocked.create.mock.calls[0][0].userName).toBe('Ada Lovelace');
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(
      createKey(makeReq({ user: undefined, body: { name: 'k', scopes: ['vision:read'] } }), makeRes())
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe('listKeys', () => {
  it("returns only the caller's own keys", async () => {
    // Scoped by the session, never by anything in the path — there is no route
    // here that can reach someone else's key.
    mocked.list.mockResolvedValue([summary]);
    const res = makeRes();

    await listKeys(makeReq(), res);

    expect(mocked.list).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [summary] });
  });
});

describe('revealKey', () => {
  it('returns the stored token, scoped to its owner', async () => {
    mocked.reveal.mockResolvedValue('vsn_live_0123456789ab_secret');
    const res = makeRes();

    await revealKey(makeReq({ params: { id: 'k1' } }), res);

    expect(mocked.reveal).toHaveBeenCalledWith('u1', 'k1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { token: 'vsn_live_0123456789ab_secret' },
    });
  });

  it("404s on someone else's key rather than saying it exists", async () => {
    mocked.reveal.mockResolvedValue(null);

    await expect(revealKey(makeReq({ params: { id: 'k9' } }), makeRes())).rejects.toThrow(
      /not found/
    );
  });
});

describe('revokeKey', () => {
  it('tombstones the key and returns its new state', async () => {
    const revoked = { ...summary, revokedAt: '2026-09-05T00:00:00.000Z' };
    mocked.revoke.mockResolvedValue(revoked);
    const res = makeRes();

    await revokeKey(makeReq({ params: { id: 'k1' } }), res);

    expect(res.json.mock.calls[0][0].data.revokedAt).toBe('2026-09-05T00:00:00.000Z');
  });

  it('404s on a key that is not the caller’s', async () => {
    mocked.revoke.mockResolvedValue(null);
    await expect(revokeKey(makeReq({ params: { id: 'k9' } }), makeRes())).rejects.toThrow(/not found/);
  });
});

describe('removeKey', () => {
  it('reports success when a record was removed', async () => {
    mocked.remove.mockResolvedValue(true);
    const res = makeRes();

    await removeKey(makeReq({ params: { id: 'k1' } }), res);

    expect(mocked.remove).toHaveBeenCalledWith('u1', 'k1');
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('404s when there was nothing to remove', async () => {
    mocked.remove.mockResolvedValue(false);
    await expect(removeKey(makeReq({ params: { id: 'k9' } }), makeRes())).rejects.toThrow(/not found/);
  });
});
