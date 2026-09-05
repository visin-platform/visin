import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test' })
}));

import { toolUsageService } from './toolUsageService';

const stubFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => vi.restoreAllMocks());

describe('toolUsageService', () => {
  it('asks for a summary over the requested window', async () => {
    const fetchMock = stubFetch({ success: true, data: { windowDays: 7, usage: [] } });

    await expect(toolUsageService.summary(7)).resolves.toEqual({ windowDays: 7, usage: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/tool-usage?days=7');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('bounds how many recent calls it pulls', async () => {
    const fetchMock = stubFetch({ success: true, data: [] });

    await toolUsageService.recent();

    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/tool-calls?limit=50');
  });

  it("surfaces auth-service's message when it refuses", async () => {
    stubFetch({ success: false, message: 'Not authenticated' }, 401);

    await expect(toolUsageService.summary(30)).rejects.toThrow(/Not authenticated/);
  });
});
