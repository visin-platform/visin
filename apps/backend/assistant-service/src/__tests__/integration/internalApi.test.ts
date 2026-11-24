import '../helpers/mocks';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AssistantRun } from '../../models/AssistantRun';
import { Assistant } from '../../models/Assistant';
import { enableAnalyst } from '../helpers/analystFixtures';
import { chatMessages, seedAssistantChat, seedRoom } from '../helpers/chatData';
import { stubChat } from '../helpers/stubChat';
import { base, request, setupAssistantTests } from '../helpers/testServer';

setupAssistantTests();

let chat: Awaited<ReturnType<typeof stubChat>>;
beforeAll(async () => {
  chat = await stubChat();
});
afterAll(async () => {
  await chat.close();
});

const internal = (path: string, body?: unknown, token: string | null = 'test', method = body === undefined ? 'GET' : 'POST') =>
  fetch(`${base}/api/assistant/internal${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
const prepared = (conversationId: string, extra: Record<string, unknown> = {}) => ({
  person: { id: 'alice', email: 'alice@example.test', name: 'Alice' },
  conversationId,
  membershipVersion: 1,
  ...extra
});

/** What chat asks of Vivi, by the shared internal token and by nothing else. */
it('answers chat only with the internal token', async () => {
  const room = String((await seedRoom())._id);
  for (const [path, body] of [
    ['/questions/prepare', prepared(room)],
    ['/assistants/resolve', { userId: 'alice' }],
    ['/runs/cancel', { conversationId: room, userId: 'alice' }],
    ['/runs/cancel-message', { conversationId: room, messageId: 'm1' }]
  ] as const) {
    expect((await internal(path, body, null)).status).toBe(401);
    expect((await internal(path, body, 'wrong')).status).toBe(401);
  }
  expect((await internal('/capabilities?userId=alice', undefined, null)).status).toBe(401);
});

it('prepares a question to a private assistant, and says what to bind a thread that has none', async () => {
  await enableAnalyst('test');
  const created = await request('/assistants', 'alice', { name: 'Fusion Bot', personality: 'Dry.' });
  expect(created.status).toBe(201);
  const assistantId = String((created.body.data as { _id: string })._id);
  await request(`/assistants/${assistantId}/profile`, 'alice');
  await Assistant.updateOne({ _id: assistantId }, { $set: { defaultForUserIds: ['alice'] } });
  const thread = String((await seedAssistantChat('alice'))._id);
  const response = await internal('/questions/prepare', prepared(thread, { screen: { tabId: 'tab-12345', path: '/projects' } }));
  const body = (await response.json()) as { data: { bindAssistantId?: string; request: Record<string, unknown> } };
  expect(response.status).toBe(200);
  expect(body.data.bindAssistantId).toBe(assistantId);
  expect(body.data.request).toMatchObject({ userId: 'alice', assistantId, assistantName: 'Fusion Bot', membershipVersion: 1 });
});

it('refuses a question the assistants cannot take, in the words a person is shown', async () => {
  const thread = String((await seedAssistantChat('alice'))._id);
  // Nothing is configured yet.
  let refused = await internal('/questions/prepare', prepared(thread));
  expect(refused.status).toBe(400);
  expect(((await refused.json()) as { message: string }).message).toContain('not configured');
  await enableAnalyst('test');
  refused = await internal('/questions/prepare', prepared(thread, { assistantId: 'ffffffffffffffffffffffff' }));
  expect(refused.status).toBe(400);
  expect(((await refused.json()) as { message: string }).message).toContain('paused or removed');
  expect((await internal('/questions/prepare', prepared('ffffffffffffffffffffffff'))).status).toBe(404);
  // Malformed requests are refused before anything is looked up.
  expect((await internal('/questions/prepare', { ...prepared(thread), surprise: true })).status).toBe(400);
  expect((await internal('/questions/prepare', { conversationId: thread })).status).toBe(400);
});

it('says which assistant a person means, or none', async () => {
  expect(await (await internal('/assistants/resolve', { userId: 'alice' })).json()).toMatchObject({ data: null });
  const created = await request('/assistants', 'alice', { name: 'Mine', personality: '' });
  const id = String((created.body.data as { _id: string })._id);
  const named = (await (await internal('/assistants/resolve', { userId: 'alice', assistantId: id })).json()) as { data: unknown };
  expect(named.data).toEqual({ id, name: 'Mine' });
  expect(await (await internal('/assistants/resolve', { userId: 'bob', assistantId: id })).json()).toMatchObject({ data: null });
});

it("cancels a person's open questions, and one question, and tells chat to take its requests back", async () => {
  const thread = String((await seedAssistantChat('alice'))._id);
  const message = await chatMessages.create({ conversationId: thread, senderId: 'alice', senderName: 'Alice', kind: 'person', body: 'Q', clientId: 'cancel-q-1', seq: 1 });
  const run = (state: 'queued' | 'running', messageId: string, extra: Record<string, unknown> = {}) =>
    AssistantRun.create({ conversationId: thread, messageId, userId: 'alice', email: 'a@example.test', name: 'Alice', state, ...extra });
  const open = await run('queued', String(message._id));
  const other = await run('queued', 'someone-elses-message', { userId: 'bob' });
  process.env.CHAT_INTERNAL_URL = chat.url;
  expect((await internal('/runs/cancel', { conversationId: thread, userId: 'alice' })).status).toBe(200);
  expect((await AssistantRun.findById(open.id))?.state).toBe('cancelled');
  expect((await AssistantRun.findById(other.id))?.state).toBe('queued');
  expect(chat.calls.at(-1)).toMatchObject({ path: '/messages/cancel-requests', body: { conversationId: thread, senderId: 'alice' } });
  const unsent = await run('running', 'unsent-message-1', { userId: 'carol' });
  expect((await internal('/runs/cancel-message', { conversationId: thread, messageId: 'unsent-message-1' })).status).toBe(200);
  expect((await AssistantRun.findById(unsent.id))?.state).toBe('cancelled');
});

it("adds Vivi's part to the page's capabilities", async () => {
  const response = await internal('/capabilities?userId=alice');
  expect(response.status).toBe(200);
  expect(((await response.json()) as { data: object }).data).toMatchObject({ assistant: false, canConfigure: false });
  expect((await internal('/capabilities')).status).toBe(400);
});
