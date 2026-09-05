import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test' })
}));

import { connectionService } from './connectionService';

const connection = {
  id: 'rt1',
  clientId: 'vsn-client-abc',
  clientName: 'Claude',
  scopes: ['vision:read'],
  createdAt: '2026-03-01T00:00:00.000Z',
  lastRenewedAt: null,
  revokedAt: null
};

const stubFetch = (body: unknown = { success: true, data: [connection] }, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('connectionService', () => {
  it('lists connections, riding the shared session cookie', async () => {
    const fetchMock = stubFetch();

    await expect(connectionService.list()).resolves.toEqual([connection]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/oauth/connections');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('disconnects by client id, not by grant id', async () => {
    // Revocation cuts every refresh token the app holds, so it is addressed by
    // the app rather than by one of its rotated grants.
    const fetchMock = stubFetch({ success: true, data: { revoked: 1 } });

    await connectionService.revoke('vsn-client-abc');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://auth-api.test/oauth/connections/vsn-client-abc'
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it("surfaces auth-service's message when there was nothing to disconnect", async () => {
    stubFetch({ success: false, message: 'No active connection for that application' }, 404);

    await expect(connectionService.revoke('nope')).rejects.toThrow(/No active connection/);
  });
});
