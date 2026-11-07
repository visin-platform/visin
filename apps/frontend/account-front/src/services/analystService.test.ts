import { describe, it, expect, vi, beforeEach } from 'vitest';

const config = vi.hoisted(() => ({ CHAT_SERVICE_URL: 'http://chat-api.test/' }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

import { analystService } from './analystService';

const stubFetch = (data: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const call = (fetchMock: ReturnType<typeof stubFetch>) => ({
  url: fetchMock.mock.calls[0][0] as string,
  init: fetchMock.mock.calls[0][1] as RequestInit
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('analystService', () => {
  it("asks chat-service's chat API, with the session cookie, whatever trailing slash the address has", async () => {
    const fetchMock = stubFetch({ assistant: false, canConfigure: true });

    await expect(analystService.capabilities()).resolves.toEqual({ assistant: false, canConfigure: true });
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/capabilities');
    expect(call(fetchMock).init.credentials).toBe('include');
  });

  it('reads the settings and the models of the provider asked for', async () => {
    let fetchMock = stubFetch({ enabled: false });
    await analystService.settings();
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant');

    fetchMock = stubFetch({ provider: 'openai', models: [], reachable: false });
    await expect(analystService.models('openai')).resolves.toMatchObject({ reachable: false });
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant/models?provider=openai');
  });

  it('saves the settings with a PUT of exactly what was chosen', async () => {
    const fetchMock = stubFetch({ enabled: true });
    await analystService.save({
      enabled: true,
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      dailyTokenLimit: 1000000,
      toolRounds: 8
    });
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant');
    expect(call(fetchMock).init.method).toBe('PUT');
    expect(JSON.parse(String(call(fetchMock).init.body))).toEqual({
      enabled: true,
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      dailyTokenLimit: 1000000,
      toolRounds: 8
    });
  });

  it("saves and removes a provider's key at that provider's own address", async () => {
    let fetchMock = stubFetch({});
    await analystService.saveKey('openai', 'sk-key-12345');
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant/keys/openai');
    expect(call(fetchMock).init.method).toBe('PUT');
    expect(JSON.parse(String(call(fetchMock).init.body))).toEqual({ key: 'sk-key-12345' });

    fetchMock = stubFetch({});
    await analystService.removeKey('anthropic');
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant/keys/anthropic');
    expect(call(fetchMock).init.method).toBe('DELETE');
  });

  it('reads usage for the period asked, and refreshes and saves prices at their own addresses', async () => {
    let fetchMock = stubFetch({ days: 7 });
    await analystService.usage(7);
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant/usage?days=7');

    fetchMock = stubFetch({ currency: 'USD', entries: [], refresh: { updated: [] } });
    await analystService.refreshPrices();
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant/prices/refresh');
    expect(call(fetchMock).init.method).toBe('POST');

    fetchMock = stubFetch({ questions: 1, models: [] });
    await expect(analystService.backfillPrices()).resolves.toEqual({ questions: 1, models: [] });
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant/prices/backfill');
    expect(call(fetchMock).init.method).toBe('POST');

    fetchMock = stubFetch({ currency: 'EUR', entries: [] });
    await analystService.savePrices({ currency: 'EUR', entries: [] });
    expect(call(fetchMock).url).toBe('http://chat-api.test/api/chat/settings/assistant/prices');
    expect(call(fetchMock).init.method).toBe('PUT');
    expect(JSON.parse(String(call(fetchMock).init.body))).toEqual({ currency: 'EUR', entries: [] });
  });
});
