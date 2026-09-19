import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test' })
}));

import { sessionService } from './sessionService';

const session = {
  id: '64b7f1f77bcf86cd79943aaa',
  device: 'Chrome on Android',
  method: 'password',
  createdAt: '2026-09-01T00:00:00.000Z',
  lastSeenAt: '2026-09-19T00:00:00.000Z',
  expiresAt: '2026-10-19T00:00:00.000Z',
  current: true
};

const stubFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('sessionService', () => {
  it('lists sessions, riding the shared session cookie', async () => {
    const fetchMock = stubFetch({ success: true, data: [session] });

    await expect(sessionService.list()).resolves.toEqual([session]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/sessions');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('signs one device out by session id', async () => {
    const fetchMock = stubFetch({ success: true, signedOut: false });

    await sessionService.revoke(session.id);

    expect(fetchMock.mock.calls[0][0]).toBe(`http://auth-api.test/auth/sessions/${session.id}`);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('signs every other device out and reports how many', async () => {
    const fetchMock = stubFetch({ success: true, revoked: 3 });

    await expect(sessionService.revokeOthers()).resolves.toBe(3);
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/sessions/revoke-others');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it("surfaces auth-service's message for a session that is already gone", async () => {
    stubFetch({ success: false, message: 'Session not found' }, 404);

    await expect(sessionService.revoke('nope')).rejects.toThrow(/Session not found/);
  });
});
