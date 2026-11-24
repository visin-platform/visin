import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  ackRequest,
  appendMessage,
  cancelRequests,
  saveSharedAssistants,
  setConversationContext,
  setMessageFinding
} from '../../services/chatClient';

/** What this service asks of chat, against a chat that answers as scripted: the address, the token, the refusals. */
let server: Server;
let seen: { path: string; token: string | undefined; body: unknown }[];
let answer: { status: number; body: unknown };
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      seen.push({ path: req.url ?? '', token: req.headers['x-internal-token'] as string | undefined, body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.CHAT_INTERNAL_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  process.env.INTERNAL_SERVICE_TOKEN = 'shared-token';
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  seen = [];
  answer = { status: 200, body: { success: true, data: {} } };
});

const message = {
  conversationId: 'c1',
  senderId: 'assistant:a1',
  senderName: 'Vivi',
  kind: 'assistant' as const,
  body: 'Hello',
  clientId: 'assistant:m1'
};

it('calls chat’s internal API with the shared token, at the address chat is given', async () => {
  answer.body = { success: true, data: { id: 'm9' } };
  expect(await appendMessage({ ...message, evidence: [{ tool: 'x', input: {}, at: new Date(0) }] })).toEqual({ id: 'm9' });
  expect(seen[0]).toMatchObject({ path: '/api/chat/internal/assistant/messages', token: 'shared-token' });
  expect(seen[0].body).toMatchObject({ clientId: 'assistant:m1', evidence: [{ at: '1970-01-01T00:00:00.000Z' }] });
});

it('names the message in the path and sends only what chat takes', async () => {
  await ackRequest('m 1');
  await setMessageFinding('m2', 'f1');
  await cancelRequests({ messageId: 'm3' });
  expect(seen.map((call) => call.path)).toEqual([
    '/api/chat/internal/assistant/messages/m%201/ack',
    '/api/chat/internal/assistant/messages/m2/finding',
    '/api/chat/internal/assistant/messages/cancel-requests'
  ]);
  expect(seen[1].body).toEqual({ findingId: 'f1' });
  expect(seen[2].body).toEqual({ messageId: 'm3' });
});

it('reads whether a conversation’s selection was kept, and whether a change to its assistants was saved', async () => {
  answer.body = { success: true, data: { updated: true } };
  expect(await setConversationContext({ conversationId: 'c1', userId: 'alice', trainingIds: ['r1'], trainingLabels: [] })).toBe(true);
  expect(seen[0]).toMatchObject({ path: '/api/chat/internal/assistant/conversations/c1/context', body: { userId: 'alice', trainingIds: ['r1'] } });
  answer.body = { success: true, data: { saved: { membershipVersion: 4 } } };
  const change = { conversationId: 'c1', expectedVersion: 3, botIds: ['b'], policy: { enabled: false, lockedOff: false, consents: [] } };
  expect(await saveSharedAssistants(change)).toEqual({ membershipVersion: 4 });
  answer.body = { success: true, data: { saved: null } };
  expect(await saveSharedAssistants(change)).toBeNull();
});

it.each([
  [400, 'BadRequestError'],
  [403, 'ForbiddenError'],
  [404, 'NotFoundError'],
  [409, 'ConflictError'],
  [500, 'BadGatewayError']
])('turns chat’s %i into the same kind of error here, with chat’s words', async (status, kind) => {
  answer = { status, body: { success: false, message: 'Chat says no' } };
  const error = await appendMessage(message).catch((e: Error) => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).constructor.name).toBe(kind);
  if (status !== 500) expect((error as Error).message).toBe('Chat says no');
});

it('still refuses, plainly, when chat answers with something that is not JSON', async () => {
  answer = { status: 502, body: '<html>Bad gateway</html>' };
  await expect(ackRequest('m1')).rejects.toThrow('chat-service answered 502');
  answer = { status: 404, body: '<html>nope</html>' };
  await expect(ackRequest('m1')).rejects.toThrow('chat-service refused the request');
});
