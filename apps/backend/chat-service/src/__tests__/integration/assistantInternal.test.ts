import '../helpers/mocks';
import { expect, it } from 'vitest';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { appendMessage } from '../../services/messages';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

/** The assistant service changing chat's data: by the shared internal token and through these routes only. */
const internal = (path: string, body: unknown, token: string | null = 'test') =>
  fetch(`${base}/api/chat/internal/assistant${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) },
    body: JSON.stringify(body)
  });
const answer = (conversationId: string, extra: Record<string, unknown> = {}) => ({
  conversationId,
  senderId: 'assistant:bot-1',
  senderName: 'Bot',
  kind: 'assistant',
  body: 'The answer.',
  clientId: 'assistant:question-1',
  ...extra
});

it('answers the assistant service only with the internal token', async () => {
  const id = await create('assistant', []);
  for (const [path, body] of [
    ['/messages', answer(id)],
    ['/messages/cancel-requests', { messageId: 'm1' }],
    ['/messages/m1/ack', {}],
    ['/messages/m1/finding', { findingId: 'f1' }],
    [`/conversations/${id}/context`, { userId: 'alice', trainingIds: [], trainingLabels: [] }],
    [`/conversations/${id}/shared-assistants`, { expectedVersion: 0, botIds: [], policy: { enabled: false, lockedOff: false, consents: [] } }]
  ] as const) {
    expect((await internal(path, body, null)).status).toBe(401);
    expect((await internal(path, body, 'wrong')).status).toBe(401);
  }
  expect(await Message.countDocuments({ conversationId: id })).toBe(0);
});

it('publishes an answer once, idempotently by its client id, in order with the conversation', async () => {
  const id = await create('assistant', []);
  const first = await internal('/messages', answer(id, { evidence: [{ tool: 'search', input: { q: 'x' }, at: '2026-11-23T10:00:00.000Z' }] }));
  expect(first.status).toBe(200);
  const { data } = (await first.json()) as { data: { id: string } };
  const again = (await (await internal('/messages', answer(id))).json()) as { data: { id: string } };
  expect(again.data.id).toBe(data.id);
  const stored = await Message.findById(data.id);
  expect(stored).toMatchObject({ kind: 'assistant', body: 'The answer.', seq: 1 });
  expect(stored?.evidence?.[0]?.at).toEqual(new Date('2026-11-23T10:00:00.000Z'));
  expect(await Message.countDocuments({ conversationId: id })).toBe(1);
});

it('refuses an answer the conversation has moved on from, or one that is not an answer', async () => {
  const id = await create('assistant', []);
  const stale = await internal('/messages', answer(id, { expectedMembershipVersion: 99 }));
  expect(stale.status).toBe(409);
  expect(await Message.countDocuments({ conversationId: id })).toBe(0);
  // Only an assistant's answer or a line saying what changed: never a message as a person.
  expect((await internal('/messages', answer(id, { kind: 'person' }))).status).toBe(400);
  expect((await internal('/messages', answer(id, { surprise: true }))).status).toBe(400);
  expect((await internal('/messages', answer(id, { body: 'x'.repeat(20001) }))).status).toBe(400);
});

it('takes questions back, acknowledges them and records findings, as it is asked', async () => {
  const id = await create('assistant', []);
  const sent = await request(`/conversations/${id}/messages`, 'alice', { body: 'Question', clientId: 'internal-question-1' });
  const messageId = String(sent.body.data._id);
  const hidden = () => Message.findById(messageId).select('+assistantRequest +assistantCancelled');
  expect((await hidden())?.assistantRequest).toBeDefined();
  expect((await internal(`/messages/${messageId}/ack`, {})).status).toBe(200);
  expect((await hidden())?.assistantRequest).toBeUndefined();
  expect((await internal(`/messages/${messageId}/finding`, { findingId: 'finding-9' })).status).toBe(200);
  expect((await Message.findById(messageId))?.findingId).toBe('finding-9');
  expect((await internal(`/messages/${messageId}/finding`, {})).status).toBe(400);
  const second = await request(`/conversations/${id}/messages`, 'alice', { body: 'Another', clientId: 'internal-question-2' });
  for (const selector of [
    { messageId: String(second.body.data._id) },
    { conversationId: id, senderId: 'alice', messageIds: [] },
    { assistantId: 'bot-1' }
  ])
    expect((await internal('/messages/cancel-requests', selector)).status).toBe(200);
  expect((await Message.findById(second.body.data._id).select('+assistantCancelled'))?.assistantCancelled).toBe(true);
  expect((await internal('/messages/cancel-requests', { nothing: true })).status).toBe(400);
});

it("keeps an assistant's chosen runs with a chat, and saves a change to its shared assistants once", async () => {
  const id = await create('assistant', []);
  const kept = await internal(`/conversations/${id}/context`, { userId: 'alice', trainingIds: ['r1'], trainingLabels: [{ id: 'r1', name: 'One' }] });
  expect(((await kept.json()) as { data: { updated: boolean } }).data.updated).toBe(true);
  const refused = await internal(`/conversations/${id}/context`, { userId: 'mallory', trainingIds: [], trainingLabels: [] });
  expect(((await refused.json()) as { data: { updated: boolean } }).data.updated).toBe(false);
  expect((await internal(`/conversations/${id}/context`, { userId: 'alice', trainingIds: new Array(21).fill('r'), trainingLabels: [] })).status).toBe(400);

  const room = await create('room', ['bob']);
  const version = (await Conversation.findById(room))!.__v;
  const change = { expectedVersion: version, botIds: ['bot-a'], policy: { enabled: true, lockedOff: false, consents: [{ userId: 'alice', audience: 'room' }] } };
  const saved = (await (await internal(`/conversations/${room}/shared-assistants`, change)).json()) as { data: { saved: { membershipVersion: number } | null } };
  expect(saved.data.saved?.membershipVersion).toBeGreaterThan(1);
  const stale = (await (await internal(`/conversations/${room}/shared-assistants`, change)).json()) as { data: { saved: unknown } };
  expect(stale.data.saved).toBeNull();
  expect((await Conversation.findById(room))?.sharedAssistantIds).toEqual(['bot-a']);
  expect(await appendMessage({ conversationId: room, senderId: 'alice', senderName: 'Alice', kind: 'person', body: 'Hi', clientId: 'after-change-1' })).toBeTruthy();
});

it('writes the line that tells the members about a change with the change, and only once', async () => {
  const room = await create('room', ['bob']);
  const version = (await Conversation.findById(room))!.__v;
  const announce = { senderId: 'alice', senderName: 'Alice', body: 'Alice added Helper.' };
  const change = { expectedVersion: version, botIds: ['bot-a'], policy: { enabled: false, lockedOff: false, consents: [] }, announce };
  expect((await internal(`/conversations/${room}/shared-assistants`, change)).status).toBe(200);
  // A repeat of the same change is stale: nothing more is saved, and no second line.
  expect((await internal(`/conversations/${room}/shared-assistants`, change)).status).toBe(200);
  const lines = await Message.find({ conversationId: room, kind: 'system', body: announce.body });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ senderId: 'alice', senderName: 'Alice' });
  expect((await internal(`/conversations/${room}/shared-assistants`, { ...change, announce: { ...announce, body: '' } })).status).toBe(400);
});

it('publishes an answer that made many lookups, and keeps a run with a long name', async () => {
  const id = await create('assistant', []);
  // More than 200 lookups, and more than a person's request may weigh (100kb).
  const evidence = Array.from({ length: 250 }, (_, i) => ({ tool: 'get_training', input: { i, query: 'x'.repeat(1000) }, at: new Date().toISOString() }));
  const published = await internal('/messages', { conversationId: id, senderId: 'assistant:analyst', senderName: 'Vivi', kind: 'assistant', body: 'Done', clientId: 'many-lookups', evidence });
  expect(published.status).toBe(200);
  const name = 'r'.repeat(300);
  const kept = await internal(`/conversations/${id}/context`, { userId: 'alice', trainingIds: ['r1'], trainingLabels: [{ id: 'r1', name }] });
  expect(((await kept.json()) as { data: { updated: boolean } }).data.updated).toBe(true);
});
