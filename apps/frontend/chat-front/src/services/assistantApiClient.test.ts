import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assistantApi, assistantApiDelete, assistantApiPut, assistantApiSend } from './assistantApiClient';
import { api } from './apiClient';
const config = vi.hoisted(() => ({ CHAT_SERVICE_URL: 'http://chat.test/', ASSISTANT_SERVICE_URL: 'http://assistants.test/' }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

beforeEach(() => {
  config.CHAT_SERVICE_URL = 'http://chat.test/';
  config.ASSISTANT_SERVICE_URL = 'http://assistants.test/';
});
afterEach(() => vi.unstubAllGlobals());

// The assistants are their own service, with their own address and path: a call to them never goes to chat.
it('sends the assistants’ calls to the assistant service with browser credentials, and chat’s to chat', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { ok: true } })));
  vi.stubGlobal('fetch', send);
  expect(await assistantApi('/assistants')).toEqual({ ok: true });
  expect(await api('/conversations')).toEqual({ ok: true });
  expect(send).toHaveBeenNthCalledWith(
    1,
    'http://assistants.test/api/assistant/assistants',
    expect.objectContaining({ credentials: 'include' })
  );
  expect(send).toHaveBeenNthCalledWith(2, 'http://chat.test/api/chat/conversations', expect.anything());
});

it('posts, puts and deletes against the assistant service', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { saved: 1 } })));
  vi.stubGlobal('fetch', send);
  expect(await assistantApi('/assistants', { name: 'Mine' })).toEqual({ saved: 1 });
  await assistantApiSend('/conversations/c1/cancel', {});
  expect(await assistantApiPut('/settings/assistant', { enabled: true })).toEqual({ saved: 1 });
  await assistantApiDelete('/settings/assistant/keys/anthropic', {});
  expect(send.mock.calls.map(([url, init]) => [init?.method, url])).toEqual([
    ['POST', 'http://assistants.test/api/assistant/assistants'],
    ['POST', 'http://assistants.test/api/assistant/conversations/c1/cancel'],
    ['PUT', 'http://assistants.test/api/assistant/settings/assistant'],
    ['DELETE', 'http://assistants.test/api/assistant/settings/assistant/keys/anthropic']
  ]);
});

it('does not send to an implicit origin when the assistant service is not configured, and says to sign in on a 401', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ message: 'Session expired' }), { status: 401 }));
  vi.stubGlobal('fetch', send);
  await expect(assistantApi('/assistants')).rejects.toThrow('Sign in');
  config.ASSISTANT_SERVICE_URL = '';
  send.mockClear();
  await expect(assistantApi('/assistants')).rejects.toThrow('not configured');
  expect(send).not.toHaveBeenCalled();
});
