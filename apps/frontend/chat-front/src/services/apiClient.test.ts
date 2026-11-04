import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './apiClient';
const config = vi.hoisted(() => ({ CHAT_SERVICE_URL: 'http://chat.test/' }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

beforeEach(() => {
  config.CHAT_SERVICE_URL = 'http://chat.test/';
});
afterEach(() => vi.unstubAllGlobals());
it('sends browser credentials and an idempotent message body to the configured service', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { _id: 'message' } })));
  vi.stubGlobal('fetch', send);
  expect(await api('/conversations/c1/messages', { body: 'Hello', clientId: 'retry-key' })).toEqual({ _id: 'message' });
  expect(send).toHaveBeenCalledWith(
    'http://chat.test/api/chat/conversations/c1/messages',
    expect.objectContaining({
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ body: 'Hello', clientId: 'retry-key' })
    })
  );
});
it('propagates cancellation and distinguishes sign-in from service errors', async () => {
  const send = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ message: 'Session expired' }), { status: 401 })
  );
  vi.stubGlobal('fetch', send);
  const controller = new AbortController();
  await expect(api('/conversations', undefined, controller.signal)).rejects.toThrow('Sign in');
  expect(send.mock.calls[0][1]?.signal).toBe(controller.signal);
  send.mockImplementation(
    async () => new Response(JSON.stringify({ message: 'Access could not be verified' }), { status: 503 })
  );
  await expect(api('/conversations')).rejects.toThrow('Access could not be verified');
});
it('does not send requests to an implicit origin when configuration is missing', async () => {
  const send = vi.fn();
  vi.stubGlobal('fetch', send);
  config.CHAT_SERVICE_URL = '';
  await expect(api('/conversations')).rejects.toThrow('not configured');
  expect(send).not.toHaveBeenCalled();
});
