import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test' })
}));

import { apiKeyService } from './apiKeyService';

const key = {
  id: 'k1',
  name: 'Claude Code',
  prefix: 'vsn_live_0123456789ab',
  scopes: ['vision:read'],
  createdAt: '2026-09-01T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null
};

const stubFetch = (body: unknown = { success: true, data: key }, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('apiKeyService', () => {
  it('lists the keys, riding the shared session cookie', async () => {
    const fetchMock = stubFetch({ success: true, data: [key] });

    await expect(apiKeyService.list()).resolves.toEqual([key]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/api-keys');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('creates a key and returns the token that comes back with it', async () => {
    const fetchMock = stubFetch({
      success: true,
      data: { key, token: 'vsn_live_0123456789ab_secret' }
    });

    const created = await apiKeyService.create({
      name: 'Claude Code',
      scopes: ['vision:read'],
      expiresInDays: 30
    });

    expect(created.token).toBe('vsn_live_0123456789ab_secret');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Claude Code',
      scopes: ['vision:read'],
      expiresInDays: 30
    });
  });

  it('reveals a key over POST, never GET', async () => {
    // A URL that returns a live credential ends up in browser history,
    // referrer headers and access logs.
    const fetchMock = stubFetch({ success: true, data: { token: 'vsn_live_abc' } });

    await expect(apiKeyService.reveal('k1')).resolves.toBe('vsn_live_abc');
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/api-keys/k1/reveal');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('revokes a key and returns its new state', async () => {
    const revoked = { ...key, revokedAt: '2026-09-05T00:00:00.000Z' };
    const fetchMock = stubFetch({ success: true, data: revoked });

    await expect(apiKeyService.revoke('k1')).resolves.toEqual(revoked);
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/api-keys/k1/revoke');
  });

  it('deletes a key', async () => {
    const fetchMock = stubFetch({ success: true }, 200);

    await apiKeyService.remove('k1');

    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/api-keys/k1');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it("surfaces auth-service's own message when it refuses", async () => {
    // A 501 when the deployment has not enabled keys is the one people will
    // actually hit; a generic failure would send them looking in the wrong place.
    stubFetch(
      { success: false, message: 'API keys are not enabled on this deployment.' },
      501
    );

    await expect(apiKeyService.list()).rejects.toThrow(/not enabled on this deployment/);
  });
});
