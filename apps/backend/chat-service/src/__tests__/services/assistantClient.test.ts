import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { cancelMessageRuns, cancelRuns, capabilities, prepare, resolve } from '../../services/assistantClient';

/** What chat asks of the assistants, against an assistant service that answers as scripted. */
let server: Server;
let seen: { method: string; path: string; token: string | undefined; body: unknown }[];
let answer: { status: number; body: unknown };
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', path: req.url ?? '', token: req.headers['x-internal-token'] as string | undefined, body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  process.env.ASSISTANT_INTERNAL_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  process.env.INTERNAL_SERVICE_TOKEN = 'shared-token';
});
afterAll(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
});
beforeEach(() => {
  seen = [];
  answer = { status: 200, body: { success: true, data: {} } };
});

const question = {
  person: { id: 'alice', email: 'a@example.test', name: 'Alice' },
  conversationId: 'c1',
  membershipVersion: 2
};

it('asks the assistant service whether a question may be put, with the shared token', async () => {
  answer.body = { success: true, data: { request: { userId: 'alice', assistantId: 'a1', membershipVersion: 2 } } };
  expect(await prepare(question)).toEqual({ request: { userId: 'alice', assistantId: 'a1', membershipVersion: 2 } });
  expect(seen[0]).toMatchObject({ method: 'POST', path: '/api/assistant/internal/questions/prepare', token: 'shared-token', body: question });
});

it('resolves an assistant, and cancels runs, one conversation or one message at a time', async () => {
  answer.body = { success: true, data: { id: 'a1', name: 'Bot' } };
  expect(await resolve({ userId: 'alice', assistantId: 'a1' })).toEqual({ id: 'a1', name: 'Bot' });
  answer.body = { success: true, data: null };
  expect(await resolve({ userId: 'alice' })).toBeNull();
  await cancelRuns({ conversationId: 'c1', userId: 'alice' });
  await cancelMessageRuns({ conversationId: 'c1', messageId: 'm1' });
  expect(seen.map((call) => call.path)).toEqual([
    '/api/assistant/internal/assistants/resolve',
    '/api/assistant/internal/assistants/resolve',
    '/api/assistant/internal/runs/cancel',
    '/api/assistant/internal/runs/cancel-message'
  ]);
});

it.each([
  [400, 'BadRequestError'],
  [403, 'ForbiddenError'],
  [404, 'NotFoundError'],
  [409, 'ConflictError'],
  [500, 'BadGatewayError']
])('turns the assistant service’s %i into the same kind of error, with its own words', async (status, kind) => {
  answer = { status, body: { success: false, message: 'This assistant is paused or removed' } };
  const error = await prepare(question).catch((e: Error) => e);
  expect((error as Error).constructor.name).toBe(kind);
  if (status !== 500) expect((error as Error).message).toBe('This assistant is paused or removed');
});

it('still refuses, plainly, when the assistant service answers with something that is not JSON', async () => {
  answer = { status: 502, body: '<html>Bad gateway</html>' };
  await expect(prepare(question)).rejects.toThrow('assistant-service answered 502');
  answer = { status: 400, body: '<html>nope</html>' };
  await expect(prepare(question)).rejects.toThrow('The assistant service refused the request');
});

it('adds what the assistant service says to the capabilities, and says Vivi is unavailable when it cannot', async () => {
  answer.body = { success: true, data: { assistant: true, assistantModel: { provider: 'anthropic', model: 'm', ready: true }, canConfigure: true } };
  expect(await capabilities('alice')).toMatchObject({ assistant: true, canConfigure: true });
  expect(seen[0]).toMatchObject({ method: 'GET', path: '/api/assistant/internal/capabilities?userId=alice' });
  answer = { status: 503, body: { success: false, message: 'down' } };
  expect(await capabilities('alice')).toEqual({
    assistant: false,
    assistantModel: { provider: '', model: '', ready: false },
    canConfigure: false
  });
});
