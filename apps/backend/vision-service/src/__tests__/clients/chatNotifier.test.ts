import { vi } from 'vitest';
import { fetchWithTimeout, logger } from '@visin/backend-core';
import { notifyRunFinished } from '../../clients/chatNotifier';

vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    fetchWithTimeout: vi.fn(),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});
const fetchMock = vi.mocked(fetchWithTimeout);
const previous = { token: process.env.INTERNAL_SERVICE_TOKEN, url: process.env.CHAT_SERVICE_URL };
const run = { userId: 'u1', trainingId: 'a'.repeat(24), name: 'night run', status: 'completed' as const };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
  process.env.CHAT_SERVICE_URL = 'http://chat.example.test:5012/';
});
afterAll(() => {
  for (const [key, value] of [
    ['INTERNAL_SERVICE_TOKEN', previous.token],
    ['CHAT_SERVICE_URL', previous.url]
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it('announces the run to chat-service with the internal token', async () => {
  fetchMock.mockResolvedValue({ ok: true } as Response);
  await notifyRunFinished(run);
  const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
  expect(url).toBe('http://chat.example.test:5012/api/chat/internal/run-finished');
  expect(init.method).toBe('POST');
  expect(init.headers['X-Internal-Token']).toBe('internal-test-token');
  expect(JSON.parse(init.body)).toEqual(run);
});

it('sends nothing where chat is not configured, or there is no token to send', async () => {
  delete process.env.CHAT_SERVICE_URL;
  await notifyRunFinished(run);
  process.env.CHAT_SERVICE_URL = 'http://chat.example.test:5012';
  delete process.env.INTERNAL_SERVICE_TOKEN;
  await notifyRunFinished(run);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('never throws: a refusal and an unreachable chat-service are only logged', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
  await expect(notifyRunFinished(run)).resolves.toBeUndefined();
  expect(logger.warn).toHaveBeenCalledWith('Run notification refused', { status: 401 });
  fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
  await expect(notifyRunFinished(run)).resolves.toBeUndefined();
  expect(logger.warn).toHaveBeenCalledWith('Run notification failed', { error: 'connect ECONNREFUSED' });
  fetchMock.mockRejectedValueOnce('plain string');
  await notifyRunFinished(run);
  expect(logger.warn).toHaveBeenLastCalledWith('Run notification failed', { error: 'plain string' });
});
