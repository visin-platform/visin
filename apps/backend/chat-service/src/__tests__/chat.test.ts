jest.mock('../services/analyst', () => ({
  RESERVATION: 160000,
  analyze: jest.fn(async () => ({
    text: 'Validation peaked at epoch 42.',
    evidence: [],
    inputTokens: 100,
    outputTokens: 20
  }))
}));
import type { Request, Response, NextFunction } from 'express';
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  fetchWithTimeout: jest.fn(jest.requireActual('@visin/backend-core').fetchWithTimeout),
  createGroupServiceClient: jest.fn(() => ({
    getMyGroups: jest.fn(async () => []),
    checkMembership: jest.fn(async () => ({ member: false, role: null }))
  })),
  createApiKey: jest.fn(async () => ({ token: 'ephemeral', summary: { id: 'key1' } })),
  deleteApiKey: jest.fn(async () => true),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user'];
    if (!id) return next(new (jest.requireActual('@visin/backend-core').UnauthorizedError)());
    req.user = { id: String(id), email: `${id}@test.invalid`, name: String(id) };
    next();
  }
}));
jest.mock('../services/access', () => ({
  ...jest.requireActual('../services/access'),
  publicPerson: jest.fn(async (handle: string) => ({ id: handle, name: handle, handle })),
  peer: jest.fn(async () => ({ _id: '111111111111111111111111', owner: { kind: 'user', id: 'alice' } }))
}));
import { createServer, type Server } from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import { AssistantRun, Budget, Block, Conversation, Message, Pricing, ProviderKey, Settings } from '../models';
import { resetAssistantSettingsCache } from '../services/settings';
import { resetProviderKeyCache } from '../services/keys';
import { fetchWithTimeout, deleteApiKey, encryptSecret } from '@visin/backend-core';
import { groups, historyFilter } from '../services/access';
import { startWorker } from '../services/worker';
import { analyze } from '../services/analyst';
import { appendMessage } from '../services/messages';
let mongo: MongoMemoryServer, server: Server, base: string, currentApp: ReturnType<typeof createApp>;
async function request(path: string, user = 'alice', body?: unknown) {
  const response = await fetch(`${base}/api/chat${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    status: response.status,
    body: (await response.json()) as { data: Record<string, unknown>; message?: string }
  };
}
async function create(kind = 'direct', handles = ['bob']) {
  const result = await request('/conversations', 'alice', { kind, title: 'Research', handles });
  expect(result.status).toBe(201);
  return String(result.body.data._id);
}
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'chat-test-secret';
  process.env.VISION_SERVICE_URL = 'http://vision.invalid';
  process.env.GROUP_SERVICE_URL = 'http://groups.invalid';
  process.env.INTERNAL_SERVICE_TOKEN = 'test';
  // What the analyst needs from the server, besides the key and model a test sets when it enables it.
  process.env.API_KEY_ENCRYPTION_SECRET = 'chat-test-encryption-secret';
  process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Conversation.init(), Message.init()]);
  currentApp = createApp();
  server = createServer((req, res) => currentApp(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, 30000);
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  process.env.API_KEY_ENCRYPTION_SECRET = 'chat-test-encryption-secret';
  process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
  currentApp = createApp();
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  await AssistantRun.deleteMany({});
  await Budget.deleteMany({});
  await Block.deleteMany({});
  await Settings.deleteMany({});
  await ProviderKey.deleteMany({});
  await Pricing.deleteMany({});
  await mongoose.connection.collection('users').deleteMany({});
  resetAssistantSettingsCache();
  (groups.getMyGroups as jest.Mock).mockResolvedValue([]);
  (groups.checkMembership as jest.Mock).mockResolvedValue({ member: false, role: null });
});

/** A provider key as an administrator saves it in the page: encrypted, with its last characters kept to show. */
async function saveKey(provider: 'anthropic' | 'openai', key: string) {
  await ProviderKey.updateOne(
    { owner: 'deployment', provider },
    { $set: { ...encryptSecret(key), hint: key.slice(-4) } },
    { upsert: true }
  );
  resetAssistantSettingsCache();
}
/** Both providers have a saved key. */
const saveKeys = async () => {
  await saveKey('anthropic', 'anthropic-key');
  await saveKey('openai', 'openai-key');
};
/** The analyst on, as an administrator would have saved it, with keys saved. */
async function enableAnalyst(model = 'test', provider: 'anthropic' | 'openai' = 'anthropic') {
  await saveKeys();
  await Settings.updateOne({ _id: 'assistant' }, { $set: { enabled: true, provider, model } }, { upsert: true });
  resetAssistantSettingsCache();
}

it('requires authentication and validates identifiers', async () => {
  expect((await request('/conversations', '')).status).toBe(401);
  expect((await request('/conversations/nope/messages')).status).toBe(400);
});
it('deduplicates a direct conversation across both participants', async () => {
  const id = await create();
  const other = await request('/conversations', 'bob', { kind: 'direct', title: 'Same pair', handles: ['alice'] });
  expect(other.status).toBe(201);
  expect(other.body.data._id).toBe(id);
  expect(await Conversation.countDocuments()).toBe(1);
});
it('allows one message request, then requires acceptance', async () => {
  const id = await create();
  expect(
    (await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'request-001' })).status
  ).toBe(201);
  expect(
    (await request(`/conversations/${id}/messages`, 'alice', { body: 'Again', clientId: 'request-002' })).status
  ).toBe(403);
  expect((await request(`/conversations/${id}/messages`, 'bob', { body: 'Hi', clientId: 'request-003' })).status).toBe(
    403
  );
  expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(200);
  expect((await request(`/conversations/${id}/messages`, 'bob', { body: 'Hi', clientId: 'request-003' })).status).toBe(
    201
  );
});
it('does not let outsiders read a conversation or its messages', async () => {
  const id = await create();
  expect((await request(`/conversations/${id}`, 'eve')).status).toBe(404);
  expect((await request(`/conversations/${id}/messages`, 'eve')).status).toBe(404);
  expect((await request(`/conversations/${id}/runs`, 'eve')).status).toBe(404);
});
it('deduplicates message retries and never overwrites their original body', async () => {
  const id = await create();
  const body = { body: 'A question', clientId: 'retry-123456' };
  const first = await request(`/conversations/${id}/messages`, 'alice', body);
  const retry = await request(`/conversations/${id}/messages`, 'alice', { ...body, body: 'Changed' });
  expect(first.body.data._id).toBe(retry.body.data._id);
  expect(retry.body.data.body).toBe('A question');
  expect(await Message.countDocuments()).toBe(1);
});
it('withholds room history before acceptance, including paginated queries', async () => {
  const id = await create('room');
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Older private discussion', clientId: 'old-000001' });
  expect((await request(`/conversations/${id}/messages`, 'bob')).body.data).toEqual([]);
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  await request(`/conversations/${id}/messages`, 'alice', { body: 'New discussion', clientId: 'new-000001' });
  const result = await request(`/conversations/${id}/messages?before=999`, 'bob');
  expect((result.body.data as unknown as { body: string }[]).map((m) => m.body)).toEqual(['New discussion']);
});
it('prevents invitation state changes by an uninvited account', async () => {
  const id = await create('room');
  expect((await request(`/conversations/${id}/membership`, 'eve', { action: 'accept' })).status).toBe(404);
  expect((await request(`/conversations/${id}/participants`, 'bob', { handle: 'eve' })).status).toBe(403);
});
it('lets room owners invite and remove participants without granting project access', async () => {
  const id = await create('room');
  expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'eve' })).status).toBe(200);
  expect((await request(`/conversations/${id}/membership`, 'eve', { action: 'accept' })).status).toBe(200);
  expect((await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'eve' })).status).toBe(200);
  expect((await request(`/conversations/${id}/messages`, 'eve')).status).toBe(404);
  expect((await Conversation.findById(id))?.projectId).toBeUndefined();
});
it('stores assistant questions as a recoverable hidden outbox', async () => {
  await enableAnalyst('test');
  const id = await create('assistant', []);
  const sent = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Explain validation',
    clientId: 'assistant-001'
  });
  expect(sent.status).toBe(201);
  expect(sent.body.data.assistantRequest).toBeUndefined();
  const stored = await Message.findOne({ conversationId: id }).select('+assistantRequest');
  expect(stored?.assistantRequest?.userId).toBe('alice');
  expect((await request(`/conversations/${id}/messages`)).body.data).not.toHaveProperty('assistantRequest');
  await request(`/conversations/${id}/cancel`, 'alice', {});
  expect((await Message.findOne({ conversationId: id }).select('+assistantRequest'))?.assistantRequest).toBeUndefined();
});
it('rejects assistant sends when disabled, while human messaging still works', async () => {
  const id = await create('assistant', []);
  expect(
    (await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'assistant-002' })).status
  ).toBe(400);
  const dm = await create();
  expect(
    (await request(`/conversations/${dm}/messages`, 'alice', { body: 'Hello', clientId: 'human-00002' })).status
  ).toBe(201);
});
it('rechecks a private analysis project on every read', async () => {
  const created = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Analysis',
    projectId: '111111111111111111111111'
  });
  expect(created.status).toBe(201);
  (fetchWithTimeout as jest.Mock).mockRejectedValueOnce(
    new (jest.requireActual('@visin/backend-core').NotFoundError)()
  );
  expect((await request(`/conversations/${created.body.data._id}/messages`)).status).toBe(404);
});
it('atomically deduplicates concurrent backend message publications', async () => {
  const id = await create('assistant', []);
  const input = {
    conversationId: id,
    senderId: 'bot',
    senderName: 'Analyst',
    kind: 'assistant' as const,
    body: 'Result',
    clientId: 'same-assistant-result'
  };
  const results = await Promise.all([appendMessage(input), appendMessage(input)]);
  expect(results[0].id).toBe(results[1].id);
  expect((await appendMessage(input)).id).toBe(results[0].id);
  expect(await Message.countDocuments()).toBe(1);
  expect((await Conversation.findById(id))?.lastMessageSeq).toBe(results[0].seq);
});
it('withholds all room messages for an invitation without a history boundary', () => {
  expect(historyFilter({ kind: 'room', participants: [{ userId: 'bob', state: 'invited' }] } as never, 'bob')).toEqual({
    seq: -1
  });
});

it('recovers the message outbox and publishes one completed answer across worker ticks', async () => {
  await enableAnalyst('test');
  const id = await create('assistant', []);
  await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Analyze validation',
    clientId: 'durable-question-1'
  });
  const worker = startWorker();
  worker();
  await worker.tick();
  expect(analyze).toHaveBeenCalled();
  expect((await AssistantRun.findOne({ conversationId: id }))?.state).toBe('completed');
  await worker.tick();
  await worker.tick();
  expect(await Message.countDocuments({ conversationId: id, kind: 'assistant' })).toBe(1);
  expect((await Budget.findOne({ userId: 'alice' }))?.reserved).toBe(120);
});
it('marks expired work as interrupted instead of repeating a potentially billed call', async () => {
  const id = await create('assistant', []);
  await AssistantRun.create({
    conversationId: id,
    messageId: 'old',
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    state: 'running',
    leaseUntil: new Date(0)
  });
  const worker = startWorker();
  worker();
  await worker.tick();
  expect((await AssistantRun.findOne({ messageId: 'old' }))?.state).toBe('failed');
});

it('discovers only shared-group roster contacts and revalidates them when starting a DM', async () => {
  const target = '222222222222222222222222';
  (groups.getMyGroups as jest.Mock).mockResolvedValue([{ groupId: 'group1', role: 'member', name: 'Lab' }]);
  (fetchWithTimeout as jest.Mock).mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          data: {
            members: [
              { userId: 'alice', email: 'alice@private.invalid' },
              { userId: target, email: 'colleague@private.invalid' }
            ]
          }
        })
      )
  );
  const contacts = await request('/contacts');
  expect(contacts.body.data).toEqual([{ id: target, name: 'colleague@private.invalid' }]);
  const created = await request('/conversations', 'alice', { kind: 'direct', title: 'Colleague', userIds: [target] });
  expect(created.status).toBe(201);
  expect(JSON.stringify(created.body.data)).not.toContain('colleague@private.invalid');
  (groups.getMyGroups as jest.Mock).mockResolvedValue([]);
  expect(
    (await request('/conversations', 'alice', { kind: 'direct', title: 'Colleague', userIds: [target] })).status
  ).toBe(404);
  (fetchWithTimeout as jest.Mock).mockImplementation(jest.requireActual('@visin/backend-core').fetchWithTimeout);
});
it('revokes group-channel access as soon as current membership is removed', async () => {
  (groups.checkMembership as jest.Mock).mockResolvedValue({ member: true, role: 'admin' });
  const created = await request('/conversations', 'alice', {
    kind: 'group',
    title: 'Lab channel',
    groupId: '111111111111111111111111'
  });
  expect(created.status).toBe(201);
  expect((await request(`/conversations/${created.body.data._id}/messages`)).status).toBe(200);
  (groups.checkMembership as jest.Mock).mockResolvedValue({ member: false, role: null });
  expect((await request(`/conversations/${created.body.data._id}/messages`)).status).toBe(404);
});
it('replays durable message sequences over SSE without exposing the outbox', async () => {
  const id = await create();
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Persistent event', clientId: 'event-001' });
  const controller = new AbortController();
  const response = await fetch(`${base}/api/chat/conversations/${id}/events`, {
    headers: { 'x-test-user': 'alice' },
    signal: controller.signal
  });
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader = response.body!.getReader();
  const chunk = new TextDecoder().decode((await reader.read()).value);
  expect(chunk).toContain('id: 1');
  expect(chunk).toContain('Persistent event');
  expect(chunk).not.toContain('assistantRequest');
  controller.abort();
});
it('saves a reviewed finding with assistant attribution credentials and deletes the temporary key', async () => {
  const created = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Analysis',
    projectId: '111111111111111111111111'
  });
  const id = String(created.body.data._id);
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Measured result',
    clientId: 'save-result-001'
  });
  (fetchWithTimeout as jest.Mock).mockImplementation(
    async () => new Response(JSON.stringify({ data: { _id: 'saved-finding' } }))
  );
  const saved = await request(`/conversations/${id}/findings`, 'alice', {
    messageId: answer.id,
    title: 'Peak',
    body: answer.body
  });
  expect(saved.status).toBe(200);
  expect((await Message.findById(answer.id))?.findingId).toBe('saved-finding');
  const outgoing = (fetchWithTimeout as jest.Mock).mock.calls.find(
    (args) => args[1]?.method === 'POST' && String(args[0]).endsWith('/findings')
  );
  expect(JSON.parse(outgoing[1].body).sourceId).toBe(`chat:${answer.id}`);
  expect(deleteApiKey).toHaveBeenCalledWith('alice', 'key1');
  (fetchWithTimeout as jest.Mock).mockImplementation(jest.requireActual('@visin/backend-core').fetchWithTimeout);
});
it('orders follow-up context by logical turns even when a reply was published later', async () => {
  await enableAnalyst('test');
  const id = await create('assistant', []);
  const first = await appendMessage({
    conversationId: id,
    senderId: 'alice',
    senderName: 'Alice',
    kind: 'person',
    body: 'First question',
    clientId: 'order-question-1'
  });
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Follow up', clientId: 'order-question-2' });
  await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'First answer',
    clientId: 'order-answer-1',
    replyTo: first.id
  });
  const worker = startWorker();
  worker();
  await worker.tick();
  const call = (analyze as jest.Mock).mock.calls.at(-1)[0];
  expect(call.history.map((m: { content: string }) => m.content)).toEqual([
    'First question',
    'First answer',
    'Follow up'
  ]);
});

it('does not generate when a cancelled question races with outbox recovery', async () => {
  await enableAnalyst('test');
  const id = await create('assistant', []);
  const sent = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Cancelled question',
    clientId: 'cancelled-race-001'
  });
  await Message.updateOne(
    { _id: sent.body.data._id },
    { $set: { assistantCancelled: true }, $unset: { assistantRequest: 1 } }
  );
  await AssistantRun.create({
    conversationId: id,
    messageId: sent.body.data._id,
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    membershipVersion: 1,
    state: 'queued'
  });
  const before = (analyze as jest.Mock).mock.calls.length;
  const worker = startWorker();
  worker();
  await worker.tick();
  expect((analyze as jest.Mock).mock.calls.length).toBe(before);
  expect((await AssistantRun.findOne({ messageId: sent.body.data._id }))?.state).toBe('cancelled');
  expect(await Budget.countDocuments()).toBe(0);
});
it('lets whoever declined a direct conversation start it again, but not the person they declined', async () => {
  const id = await create();
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'reopen-0001' });
  expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'decline' })).status).toBe(200);
  expect((await request('/conversations', 'alice', { kind: 'direct', title: 'Again', handles: ['bob'] })).status).toBe(
    403
  );
  const reopened = await request('/conversations', 'bob', { kind: 'direct', title: 'Reply', handles: ['alice'] });
  expect(reopened.status).toBe(201);
  expect(reopened.body.data._id).toBe(id);
  expect(
    (await request(`/conversations/${id}/messages`, 'bob', { body: 'Sorry, yes', clientId: 'reopen-0002' })).status
  ).toBe(201);
});
it('re-invites a removed room participant without counting departed people against the limit', async () => {
  const id = await create('room');
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'bob' });
  expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'bob' })).status).toBe(200);
  const room = await Conversation.findById(id);
  expect(room?.participants.filter((p) => p.userId === 'bob').map((p) => p.state)).toEqual(['invited']);
  expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'bob' })).status).toBe(400);
});
it('lists group channels from the groups already fetched, without a membership call per row', async () => {
  (groups.checkMembership as jest.Mock).mockResolvedValue({ member: true, role: 'admin' });
  const group = '111111111111111111111111';
  for (const title of ['One', 'Two', 'Three'])
    expect((await request('/conversations', 'alice', { kind: 'group', title, groupId: group })).status).toBe(201);
  (groups.checkMembership as jest.Mock).mockClear();
  (groups.getMyGroups as jest.Mock).mockResolvedValue([{ groupId: group, role: 'member', name: 'Lab' }]);
  expect((await request('/conversations', 'bob')).body.data).toHaveLength(3);
  expect(groups.checkMembership).not.toHaveBeenCalled();
  (groups.getMyGroups as jest.Mock).mockResolvedValue([]);
  expect((await request('/conversations', 'bob')).body.data).toHaveLength(0);
});
it('answers other conversations while one conversation is locked by another worker', async () => {
  await enableAnalyst('test');
  const busy = await create('assistant', []);
  const free = await create('assistant', []);
  await request(`/conversations/${busy}/messages`, 'alice', { body: 'First', clientId: 'locked-question' });
  await request(`/conversations/${free}/messages`, 'alice', { body: 'Second', clientId: 'free-question-1' });
  await Conversation.updateOne(
    { _id: busy },
    { $set: { workerUntil: new Date(Date.now() + 60000), workerRunId: 'elsewhere' } }
  );
  const worker = startWorker();
  worker();
  await worker.tick();
  expect((await AssistantRun.findOne({ conversationId: busy }))?.state).toBe('queued');
  expect((await AssistantRun.findOne({ conversationId: free }))?.state).toBe('completed');
});
it('runs queued analyses of different conversations side by side', async () => {
  await enableAnalyst('test');
  const first = await create('assistant', []);
  const second = await create('assistant', []);
  await request(`/conversations/${first}/messages`, 'alice', { body: 'One', clientId: 'parallel-one-1' });
  await request(`/conversations/${second}/messages`, 'alice', { body: 'Two', clientId: 'parallel-two-1' });
  let running = 0,
    peak = 0;
  (analyze as jest.Mock).mockImplementation(async () => {
    peak = Math.max(peak, ++running);
    await new Promise((resolve) => setTimeout(resolve, 50));
    running--;
    return { text: 'Done', evidence: [], inputTokens: 1, outputTokens: 1 };
  });
  const worker = startWorker();
  worker();
  await worker.tick();
  expect(peak).toBe(2);
  expect(await AssistantRun.countDocuments({ state: 'completed' })).toBe(2);
});
it('cancels only the questions still waiting for an answer', async () => {
  await enableAnalyst('test');
  const id = await create('assistant', []);
  const answered = await appendMessage({
    conversationId: id,
    senderId: 'alice',
    senderName: 'alice',
    kind: 'person',
    body: 'Answered earlier',
    clientId: 'answered-0001'
  });
  const pending = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Pending',
    clientId: 'pending-0001'
  });
  await request(`/conversations/${id}/cancel`, 'alice', {});
  const flags = await Message.find({ conversationId: id }).select('+assistantCancelled');
  expect(flags.find((m) => m.id === answered.id)?.assistantCancelled).toBe(false);
  expect(flags.find((m) => m.id === pending.body.data._id)?.assistantCancelled).toBe(true);
});
const project = { _id: '111111111111111111111111', name: 'Lab', owner: { kind: 'user', id: 'alice' } };
/** vision-service: the project for access checks, `post` for the finding save. */
const vision = (post: () => Response) =>
  (fetchWithTimeout as jest.Mock).mockImplementation(async (_url: string, init?: { method?: string }) =>
    init?.method === 'POST' ? post() : new Response(JSON.stringify({ data: project }))
  );
it('returns an already saved finding without minting another write key', async () => {
  vision(() => new Response(JSON.stringify({ data: { _id: 'should-not-be-called' } })));
  const created = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Analysis',
    projectId: '111111111111111111111111'
  });
  const id = String(created.body.data._id);
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Measured result',
    clientId: 'saved-already-1'
  });
  await Message.updateOne({ _id: answer.id }, { $set: { findingId: 'existing-finding' } });
  const { createApiKey } = jest.requireMock('@visin/backend-core') as { createApiKey: jest.Mock };
  createApiKey.mockClear();
  const saved = await request(`/conversations/${id}/findings`, 'alice', {
    messageId: answer.id,
    title: 'Peak',
    body: 'x'
  });
  expect(saved.body.data._id).toBe('existing-finding');
  expect(createApiKey).not.toHaveBeenCalled();
  (fetchWithTimeout as jest.Mock).mockImplementation(jest.requireActual('@visin/backend-core').fetchWithTimeout);
});
it('passes a refusal from vision-service through and reports its outages as a bad gateway', async () => {
  const created = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Analysis',
    projectId: '111111111111111111111111'
  });
  const id = String(created.body.data._id);
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Measured result',
    clientId: 'refused-save-1'
  });
  const save = () =>
    request(`/conversations/${id}/findings`, 'alice', { messageId: answer.id, title: 'Peak', body: 'x' });
  vision(() => new Response(JSON.stringify({ message: 'A cited run was removed' }), { status: 400 }));
  const refused = await save();
  expect(refused.status).toBe(400);
  expect(refused.body.message).toBe('A cited run was removed');
  vision(() => new Response('down', { status: 503 }));
  expect((await save()).status).toBe(502);
  (fetchWithTimeout as jest.Mock).mockImplementation(jest.requireActual('@visin/backend-core').fetchWithTimeout);
});
it("opens a group's channel for any member, once, and refuses people outside the group", async () => {
  const group = '333333333333333333333333';
  (groups.getMyGroups as jest.Mock).mockResolvedValue([{ groupId: group, role: 'member', name: 'Lab' }]);
  const first = await request(`/groups/${group}/channel`, 'alice', {});
  expect(first.status).toBe(200);
  expect(first.body.data.title).toBe('Lab');
  const again = await request(`/groups/${group}/channel`, 'bob', {});
  expect(again.body.data._id).toBe(first.body.data._id);
  expect(await Conversation.countDocuments({ groupId: group })).toBe(1);
  (groups.getMyGroups as jest.Mock).mockResolvedValue([]);
  expect((await request(`/groups/${group}/channel`, 'eve', {})).status).toBe(404);
  expect((await request('/groups/not-an-id/channel', 'alice', {})).status).toBe(400);
});

const ADMIN = '444444444444444444444444';
const makeAdmin = (id = ADMIN) =>
  mongoose.connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(id), roles: ['admin'] });
/** What each provider's list endpoint answers with, by the address asked. */
const provider = (lists: { anthropic?: string[]; openai?: { id: string; created: number }[] }) =>
  (fetchWithTimeout as jest.Mock).mockImplementation(async (url: string) => {
    if (String(url).startsWith('https://api.anthropic.com/v1/models') && lists.anthropic)
      return new Response(
        JSON.stringify({ data: lists.anthropic.map((id) => ({ id, display_name: id.toUpperCase() })) })
      );
    if (String(url).startsWith('https://api.openai.com/v1/models') && lists.openai)
      return new Response(JSON.stringify({ data: lists.openai }));
    return new Response('down', { status: 503 });
  });
const restoreFetch = () =>
  (fetchWithTimeout as jest.Mock).mockImplementation(jest.requireActual('@visin/backend-core').fetchWithTimeout);
const putSettings = (user: string, body: unknown) =>
  fetch(`${base}/api/chat/settings/assistant`, {
    method: 'PUT',
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
describe('analyst settings', () => {
  it('offers the settings only to administrators, and refuses everyone else', async () => {
    await makeAdmin();
    expect((await request('/capabilities', ADMIN)).body.data.canConfigure).toBe(true);
    expect((await request('/capabilities', 'alice')).body.data.canConfigure).toBe(false);
    for (const user of ['alice', '555555555555555555555555'])
      expect((await request('/settings/assistant', user)).status).toBe(403);
    expect(
      (await putSettings('alice', { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' })).status
    ).toBe(403);
    expect((await request('/settings/assistant/models', 'alice')).status).toBe(403);
    expect(await Settings.countDocuments()).toBe(0);
  });

  it('starts on but without a model, with the provider that has a key, and lists what only the operator can add', async () => {
    await makeAdmin();
    delete process.env.MCP_INTERNAL_URL;
    // No key anywhere: Anthropic is shown first, and nothing can answer.
    expect((await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>).toMatchObject({
      enabled: true,
      provider: 'anthropic',
      model: '',
      dailyTokenLimit: 800000,
      tokenReservation: 160000,
      source: 'default',
      ready: false
    });
    // Only OpenAI has a key: that is the provider, rather than one that could not be used.
    await saveKey('openai', 'openai-key');
    expect((await request('/settings/assistant', ADMIN)).body.data).toMatchObject({ provider: 'openai' });
    // Both have: the first.
    await saveKey('anthropic', 'anthropic-key');
    const view = (await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>;
    expect(view).toMatchObject({ provider: 'anthropic', model: '', ready: false });
    expect(view.missing).toEqual(['MCP_INTERNAL_URL']);
    expect(view.providers).toEqual([
      {
        id: 'anthropic',
        name: 'Anthropic',
        keyConfigured: true,
        keyHint: '-key'
      },
      {
        id: 'openai',
        name: 'OpenAI',
        keyConfigured: true,
        keyHint: '-key'
      }
    ]);
    expect(JSON.stringify(view)).not.toContain('anthropic-key');
    process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
  });

  it('turns the analyst on and off, with a provider and model, from the page', async () => {
    await makeAdmin();
    await saveKeys();
    const id = await create('assistant', []);
    const ask = (clientId: string) => request(`/conversations/${id}/messages`, 'alice', { body: 'Peak?', clientId });
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
    expect((await ask('settings-ask-1')).status).toBe(400);

    provider({ anthropic: ['claude-opus-5-5'] });
    const put = await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { data: object }).data).toMatchObject({
      enabled: true,
      provider: 'anthropic',
      source: 'admin',
      ready: true
    });
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(true);
    expect((await ask('settings-ask-2')).status).toBe(201);

    await putSettings(ADMIN, { enabled: false, provider: 'anthropic', model: 'claude-opus-5-5' });
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
    restoreFetch();
  });

  it("switches provider, and is ready only with that provider's own key", async () => {
    await makeAdmin();
    await saveKeys();
    provider({ openai: [{ id: 'gpt-5.1', created: 2 }] });
    const put = await putSettings(ADMIN, { enabled: true, provider: 'openai', model: 'gpt-5.1' });
    expect(((await put.json()) as { data: object }).data).toMatchObject({ provider: 'openai', ready: true });
    await ProviderKey.deleteOne({ provider: 'openai' });
    resetAssistantSettingsCache();
    const view = (await request('/settings/assistant', ADMIN)).body.data;
    expect(view).toMatchObject({ provider: 'openai', ready: false, missing: [] });
    expect((view as { providers: { id: string; keyConfigured: boolean }[] }).providers[1]).toMatchObject({
      id: 'openai',
      keyConfigured: false
    });
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
    restoreFetch();
  });

  it('only accepts a model the chosen provider offers, never one typed in', async () => {
    await makeAdmin();
    await saveKeys();
    provider({ anthropic: ['claude-opus-5-5'], openai: [{ id: 'gpt-5.1', created: 1 }] });
    const refused = await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-made-up' });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { message: string }).message).toContain(
      'Anthropic does not offer claude-made-up'
    );
    // Another provider's model is not this provider's.
    expect((await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'gpt-5.1' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: '' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: true, provider: 'nobody', model: 'x' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: true, model: 'claude-opus-5-5' })).status).toBe(400);
    expect(await Settings.countDocuments()).toBe(0);
    restoreFetch();
  });

  it('cannot turn the analyst on while the provider cannot list its models, but can always turn it off', async () => {
    await makeAdmin();
    await saveKeys();
    provider({});
    const on = await putSettings(ADMIN, { enabled: true, provider: 'openai', model: 'gpt-5.1' });
    expect(on.status).toBe(400);
    expect(((await on.json()) as { message: string }).message).toContain('Add a valid OpenAI key first');
    await ProviderKey.deleteOne({ provider: 'openai' });
    resetAssistantSettingsCache();
    expect((await putSettings(ADMIN, { enabled: true, provider: 'openai', model: 'gpt-5.1' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: false, provider: 'openai', model: 'gone-model' })).status).toBe(200);
    expect(await Settings.countDocuments()).toBe(1);
    restoreFetch();
  });

  it('lists the models of the provider asked for, newest first, and only chat models for OpenAI', async () => {
    await makeAdmin();
    await saveKeys();
    provider({
      anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5'],
      openai: [
        { id: 'gpt-4o', created: 10 },
        { id: 'text-embedding-3-small', created: 50 },
        { id: 'gpt-5.1', created: 30 },
        { id: 'whisper-1', created: 5 },
        { id: 'gpt-4o-mini-tts', created: 40 },
        { id: 'o4-mini', created: 20 },
        { id: 'dall-e-3', created: 1 }
      ]
    });
    (fetchWithTimeout as jest.Mock).mockClear();
    expect((await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data).toEqual({
      provider: 'anthropic',
      reachable: true,
      recommended: 'claude-sonnet-5-5',
      models: [
        { id: 'claude-opus-5-5', name: 'CLAUDE-OPUS-5-5', tier: 'best' },
        { id: 'claude-sonnet-5-5', name: 'CLAUDE-SONNET-5-5', tier: 'balanced' }
      ]
    });
    expect((fetchWithTimeout as jest.Mock).mock.calls[0][1].headers['x-api-key']).toBe('anthropic-key');
    const openai = (await request('/settings/assistant/models?provider=openai', ADMIN)).body.data as {
      models: { id: string }[];
    };
    expect(openai.models.map((model) => model.id)).toEqual(['gpt-5.1', 'o4-mini', 'gpt-4o']);
    expect((fetchWithTimeout as jest.Mock).mock.calls.at(-1)[1].headers.authorization).toBe('Bearer openai-key');
    // With no provider named, the one in use.
    expect((await request('/settings/assistant/models', ADMIN)).body.data).toMatchObject({ provider: 'anthropic' });
    await ProviderKey.deleteOne({ provider: 'anthropic' });
    resetAssistantSettingsCache();
    expect((await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data).toMatchObject({
      reachable: false,
      models: []
    });
    expect((await request('/settings/assistant/models?provider=nobody', ADMIN)).status).toBe(400);
    restoreFetch();
  });

  it('runs a question with the provider and model that are set when it starts', async () => {
    await enableAnalyst('claude-sonnet-5-5');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId: 'model-question-1' });
    await Settings.updateOne({ _id: 'assistant' }, { $set: { provider: 'openai', model: 'gpt-5.1' } });
    resetAssistantSettingsCache();
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as jest.Mock).mock.calls.at(-1)[0]).toMatchObject({ provider: 'openai', model: 'gpt-5.1' });
    expect(await AssistantRun.findOne({ conversationId: id })).toMatchObject({ provider: 'openai', model: 'gpt-5.1' });
  });

  it('does not start questions while the settings have the analyst off', async () => {
    await enableAnalyst('claude-sonnet-5-5');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId: 'off-question-1' });
    await Settings.updateOne({ _id: 'assistant' }, { $set: { enabled: false } });
    resetAssistantSettingsCache();
    const before = (analyze as jest.Mock).mock.calls.length;
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as jest.Mock).mock.calls.length).toBe(before);
    expect((await AssistantRun.findOne({ conversationId: id }))?.state).toBe('queued');
  });
});

describe('provider keys', () => {
  const GOOD = 'sk-test-good-key-1234';
  const putKey = (user: string, provider: string, body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/keys/${provider}`, {
      method: 'PUT',
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const deleteKey = (user: string, provider: string) =>
    fetch(`${base}/api/chat/settings/assistant/keys/${provider}`, {
      method: 'DELETE',
      headers: { 'x-test-user': user }
    });
  const view = async () => (await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>;
  const providers = async () => (await view()).providers as Record<string, unknown>[];
  /** The provider accepts only GOOD, whichever header it came in. */
  const acceptsOnly = (key: string) =>
    (fetchWithTimeout as jest.Mock).mockImplementation(
      async (_url: string, init?: { headers?: Record<string, string> }) => {
        const presented = init?.headers?.['x-api-key'] ?? init?.headers?.authorization?.replace('Bearer ', '');
        return presented === key
          ? new Response(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Opus' }] }))
          : new Response('invalid key', { status: 401 });
      }
    );

  beforeEach(async () => {
    await makeAdmin();
    acceptsOnly(GOOD);
  });
  afterEach(restoreFetch);

  it('lets only administrators save or remove a key', async () => {
    for (const user of ['alice', '555555555555555555555555']) {
      expect((await putKey(user, 'anthropic', { key: GOOD })).status).toBe(403);
      expect((await deleteKey(user, 'anthropic')).status).toBe(403);
    }
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('keeps a key the provider accepts, encrypted, and shows only where it came from and its last characters', async () => {
    const saved = await putKey(ADMIN, 'anthropic', { key: GOOD });
    expect(saved.status).toBe(200);
    const body = await saved.text();
    expect(body).not.toContain(GOOD);
    expect(JSON.parse(body).data.providers[0]).toEqual({
      id: 'anthropic',
      name: 'Anthropic',
      keyConfigured: true,
      keyHint: '1234'
    });
    const record = await ProviderKey.findOne({ provider: 'anthropic' }).lean();
    expect(record?.owner).toBe('deployment');
    expect(JSON.stringify(record)).not.toContain(GOOD);
    expect(record?.ciphertext).toBeTruthy();
    expect(JSON.stringify(await view())).not.toContain(GOOD);
  });

  it('refuses a key the provider does not accept, without keeping it or repeating it', async () => {
    const refused = await putKey(ADMIN, 'anthropic', { key: 'sk-test-wrong-key-9999' });
    expect(refused.status).toBe(400);
    const text = await refused.text();
    expect(text).toContain('Anthropic did not accept this key');
    expect(text).not.toContain('wrong-key');
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('refuses what is plainly not a key, without echoing it', async () => {
    for (const key of ['short', 'has a space in it', 'x'.repeat(501), '']) {
      const response = await putKey(ADMIN, 'anthropic', { key });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(key || 'never-empty');
    }
    expect((await putKey(ADMIN, 'anthropic', {})).status).toBe(400);
    expect((await putKey(ADMIN, 'anthropic', { key: GOOD, extra: 1 })).status).toBe(400);
    expect((await putKey(ADMIN, 'nobody', { key: GOOD })).status).toBe(400);
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('cannot save a key until the server can encrypt it', async () => {
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    const response = await putKey(ADMIN, 'anthropic', { key: GOOD });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('API_KEY_ENCRYPTION_SECRET');
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('reports the provider being unreachable as that, not as a bad key', async () => {
    (fetchWithTimeout as jest.Mock).mockRejectedValue(new Error('socket hang up'));
    expect((await putKey(ADMIN, 'anthropic', { key: GOOD })).status).toBe(502);
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('uses the saved key to list models and to answer', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    (fetchWithTimeout as jest.Mock).mockClear();
    const models = (await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data;
    expect(models).toMatchObject({ reachable: true });
    expect((fetchWithTimeout as jest.Mock).mock.calls[0][1].headers['x-api-key']).toBe(GOOD);

    const put = await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(put.status).toBe(200);
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId: 'saved-key-question' });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as jest.Mock).mock.calls.at(-1)[0]).toMatchObject({ provider: 'anthropic', apiKey: GOOD });
    // The key is used for the call and never kept with the run.
    expect(JSON.stringify(await AssistantRun.findOne({ conversationId: id }).lean())).not.toContain(GOOD);
  });

  it('makes a provider ready that has only a saved key, and not ready again once it is removed', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    expect((await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' })).status).toBe(
      200
    );
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(true);
    const removed = await deleteKey(ADMIN, 'anthropic');
    expect(removed.status).toBe(200);
    expect(
      ((await removed.json()) as { data: { providers: Record<string, unknown>[] } }).data.providers[0]
    ).toMatchObject({
      keyConfigured: false,
      keyHint: null
    });
    expect(await ProviderKey.countDocuments()).toBe(0);
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
  });

  it('replaces the key for a provider rather than adding another, and keeps the providers apart', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    acceptsOnly('sk-test-second-key-5678');
    await putKey(ADMIN, 'anthropic', { key: 'sk-test-second-key-5678' });
    expect(await ProviderKey.countDocuments({ provider: 'anthropic' })).toBe(1);
    expect((await providers())[0]).toMatchObject({ keyHint: '5678' });
    expect((await providers())[1]).toMatchObject({ id: 'openai', keyConfigured: false });
  });

  it('treats a saved key it can no longer decrypt as no key, so it can be added again', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    await ProviderKey.updateOne({ provider: 'anthropic' }, { $set: { tag: Buffer.alloc(16).toString('base64') } });
    resetAssistantSettingsCache();
    expect((await providers())[0]).toMatchObject({ keyConfigured: false, keyHint: null });
    expect((await putKey(ADMIN, 'anthropic', { key: GOOD })).status).toBe(200);
    expect((await providers())[0]).toMatchObject({ keyConfigured: true, keyHint: '1234' });
  });

  it('treats a saved key as none while the encryption secret is missing, rather than failing', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    const secret = process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    try {
      resetAssistantSettingsCache();
      expect((await providers())[0]).toMatchObject({ keyConfigured: false, keyHint: null });
    } finally {
      process.env.API_KEY_ENCRYPTION_SECRET = secret;
      resetAssistantSettingsCache();
    }
    expect((await providers())[0]).toMatchObject({ keyConfigured: true, keyHint: '1234' });
  });

  it('never reads a provider key from the environment', async () => {
    process.env.ANTHROPIC_API_KEY = 'from-the-environment';
    process.env.OPENAI_API_KEY = 'from-the-environment';
    try {
      resetAssistantSettingsCache();
      expect((await providers()).map((provider) => provider.keyConfigured)).toEqual([false, false]);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
    }
  });
});

describe('the daily token limit', () => {
  const view = async () => (await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>;
  const save = (body: Record<string, unknown>) =>
    putSettings(ADMIN, { enabled: false, provider: 'anthropic', model: '', ...body });

  beforeEach(async () => {
    await makeAdmin();
  });

  it('is saved with the other settings, kept when a save leaves it out, and starts at the default', async () => {
    expect((await view()).dailyTokenLimit).toBe(800000);
    const saved = await save({ dailyTokenLimit: 2000000 });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { data: Record<string, unknown> }).data).toMatchObject({
      dailyTokenLimit: 2000000,
      tokenReservation: 160000,
      source: 'admin'
    });
    // Saving only the switch leaves the limit alone.
    expect((await save({ enabled: false })).status).toBe(200);
    expect((await view()).dailyTokenLimit).toBe(2000000);
    expect((await Settings.findById('assistant').lean())?.dailyTokenLimit).toBe(2000000);
  });

  it('is a whole number of tokens, at least what one question reserves, and not absurdly large', async () => {
    const tooSmall = await save({ dailyTokenLimit: 159999 });
    expect(tooSmall.status).toBe(400);
    expect(((await tooSmall.json()) as { message: string }).message).toContain('at least 160,000 tokens');
    expect((await save({ dailyTokenLimit: 160000 })).status).toBe(200);
    expect((await save({ dailyTokenLimit: 1_000_000_001 })).status).toBe(400);
    expect((await save({ dailyTokenLimit: 1_000_000_000 })).status).toBe(200);
    for (const bad of [1.5, '800000', -5, 0, null, Number.NaN])
      expect((await save({ dailyTokenLimit: bad })).status).toBe(400);
    expect((await view()).dailyTokenLimit).toBe(1_000_000_000);
  });

  it('is applied to the next question: a person who has used most of it is refused, until it is raised', async () => {
    await enableAnalyst('test');
    const day = new Date().toISOString().slice(0, 10);
    await Budget.create({ userId: 'alice', day, reserved: 300000 });
    await Settings.updateOne({ _id: 'assistant' }, { $set: { dailyTokenLimit: 400000 } });
    resetAssistantSettingsCache();
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'First', clientId: 'limit-question-1' });
    const before = (analyze as jest.Mock).mock.calls.length;
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as jest.Mock).mock.calls.length).toBe(before);
    const refused = await AssistantRun.findOne({ conversationId: id });
    expect(refused?.state).toBe('failed');
    expect(refused?.error).toContain('daily assistant token budget is used');
    // Nothing was added to what they had used.
    expect((await Budget.findOne({ userId: 'alice', day }))?.reserved).toBe(300000);

    // Raised by an administrator (the analyst stays on).
    await Settings.updateOne({ _id: 'assistant' }, { $set: { dailyTokenLimit: 800000 } });
    resetAssistantSettingsCache();
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Second', clientId: 'limit-question-2' });
    await worker.tick();
    expect((analyze as jest.Mock).mock.calls.length).toBe(before + 1);
  });

  it('refuses a question before charging anything when there is no model or key to answer it', async () => {
    await enableAnalyst('test');
    await ProviderKey.deleteMany({});
    resetAssistantSettingsCache();
    const id = await create('assistant', []);
    // Ready needs a key, so a question is refused when it is sent; one already queued fails at the worker.
    const question = await appendMessage({
      conversationId: id,
      senderId: 'alice',
      senderName: 'Alice',
      kind: 'person',
      body: 'Hello',
      clientId: 'no-key-question'
    });
    await AssistantRun.create({
      conversationId: id,
      messageId: question.id,
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      membershipVersion: 1,
      state: 'queued'
    });
    const worker = startWorker();
    worker();
    await worker.tick();
    const run = await AssistantRun.findOne({ messageId: question.id });
    expect(run?.state).toBe('failed');
    expect(run?.error).toContain('key is configured');
    expect(await Budget.countDocuments()).toBe(0);
  });
});

describe('model listing and key decryption', () => {
  it('asks the provider once for callers that arrive together, and reuses the answer', async () => {
    await makeAdmin();
    await saveKeys();
    let release: (value: Response) => void = () => undefined;
    (fetchWithTimeout as jest.Mock).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    (fetchWithTimeout as jest.Mock).mockClear();
    const both = Promise.all([
      request('/settings/assistant/models?provider=anthropic', ADMIN),
      request('/settings/assistant/models?provider=anthropic', ADMIN)
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Sonnet' }] })));
    const [first, second] = await both;
    expect(first.body.data).toMatchObject({ recommended: 'claude-sonnet-5-5' });
    expect(second.body.data).toEqual(first.body.data);
    expect((await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data).toEqual(first.body.data);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    restoreFetch();
  });

  it('reports a saved key that no longer decrypts once, not on every use', async () => {
    const { logger } = jest.requireActual('@visin/backend-core') as { logger: { error: (...args: unknown[]) => void } };
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    await ProviderKey.create({
      owner: 'deployment',
      provider: 'anthropic',
      ciphertext: 'bm90LWEta2V5',
      iv: Buffer.alloc(12).toString('base64'),
      tag: Buffer.alloc(16).toString('base64')
    });
    for (let i = 0; i < 5; i++) {
      // As each new cache period would: the record is read and decrypted again.
      resetProviderKeyCache();
      expect((await request('/capabilities', 'alice')).status).toBe(200);
    }
    expect(error.mock.calls.filter((call) => String(call[0]).includes('could not be decrypted'))).toHaveLength(1);
    error.mockRestore();
  });
});

it("does not keep a replaced key's models, even when their listing finishes after the change", async () => {
  await makeAdmin();
  const releases: ((value: Response) => void)[] = [];
  (fetchWithTimeout as jest.Mock).mockImplementation(() => new Promise<Response>((resolve) => releases.push(resolve)));
  const listed = (id: string) => new Response(JSON.stringify({ data: [{ id, display_name: id }] }));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
  await saveKey('anthropic', 'old-key');
  // A listing with the old key is under way…
  const slow = request('/settings/assistant/models?provider=anthropic', ADMIN);
  await tick();
  // …when a new key is saved (it is checked by listing models directly, not through the cache).
  const save = fetch(`${base}/api/chat/settings/assistant/keys/anthropic`, {
    method: 'PUT',
    headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'sk-new-key-12345' })
  });
  await tick();
  releases[1](listed('claude-new'));
  expect((await save).status).toBe(200);
  // The old listing finishes last.
  releases[0](listed('claude-old'));
  expect(((await slow).body.data as { models: { id: string }[] }).models.map((m) => m.id)).toEqual(['claude-old']);
  // The next one asks again, with the new key, rather than serving the old key's answer.
  const next = request('/settings/assistant/models?provider=anthropic', ADMIN);
  await tick();
  expect(releases).toHaveLength(3);
  releases[2](listed('claude-new'));
  expect(((await next).body.data as { models: { id: string }[] }).models.map((m) => m.id)).toEqual(['claude-new']);
  restoreFetch();
});

/** What the usage report returns, as far as these tests read it. */
interface Tally {
  questions: number;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  unpricedQuestions: number;
  unpricedTokens: number;
}
interface UsageBody {
  days: number;
  currency: string;
  totals: Tally;
  failedQuestions: number;
  backfilledQuestions: number;
  byDay: (Tally & { day: string })[];
  byModel: (Tally & { provider: string; model: string; price: object | null; pricesInPeriod: number })[];
  byPerson: (Tally & { userId: string; name: string })[];
  prices: { currency: string; entries: object[] };
}

describe('usage and spend', () => {
  const NOW = Date.now();
  const daysAgo = (days: number, hour = 12) => {
    const day = new Date(NOW);
    day.setUTCDate(day.getUTCDate() - days);
    day.setUTCHours(hour, 0, 0, 0);
    return day;
  };
  const asked = (inputPerMillion: number, outputPerMillion: number, currency = 'USD') => ({
    currency,
    inputPerMillion,
    outputPerMillion,
    source: 'manual',
    backfilled: false
  });
  const SONNET_PRICE = asked(3, 15);
  let sequence = 0;
  /** A question answered now, at no price unless one is given: what it cost is what was kept with it. */
  const answered = (over: Record<string, unknown> = {}) =>
    AssistantRun.create({
      conversationId: 'c1',
      messageId: `m${++sequence}`,
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      state: 'completed',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      inputTokens: 1000000,
      outputTokens: 100000,
      finishedAt: daysAgo(0),
      ...over
    });
  const usage = async (days?: number, user = ADMIN) =>
    request(`/settings/assistant/usage${days ? `?days=${days}` : ''}`, user);
  const report = async (days?: number) => (await usage(days)).body.data as UsageBody;
  const putPrices = (user: string, body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/prices`, {
      method: 'PUT',
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const sonnet = { provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 3, outputPerMillion: 15 };
  /** As the service stores and returns it: typed by hand, so never overwritten by a refresh. */
  const stored = (entry: object) => ({ ...entry, source: 'manual', fetchedAt: null });

  beforeEach(async () => {
    await makeAdmin();
  });

  it('is for administrators only', async () => {
    expect((await usage(30, 'alice')).status).toBe(403);
    expect((await putPrices('alice', { currency: 'USD', entries: [sonnet] })).status).toBe(403);
    expect(await Pricing.countDocuments()).toBe(0);
  });

  it('is empty, with no money, before anything was asked', async () => {
    const empty = await report();
    expect(empty).toMatchObject({
      days: 30,
      currency: 'USD',
      failedQuestions: 0,
      backfilledQuestions: 0,
      totals: { questions: 0, inputTokens: 0, outputTokens: 0, cost: null, unpricedQuestions: 0, unpricedTokens: 0 },
      byDay: [],
      byModel: [],
      byPerson: []
    });
    expect(empty.prices).toEqual({ currency: 'USD', entries: [] });
  });

  it('counts tokens without inventing money for questions nobody priced', async () => {
    await answered();
    await answered({ inputTokens: 500000, outputTokens: 50000 });
    const data = await report();
    expect(data.totals).toEqual({
      questions: 2,
      inputTokens: 1500000,
      outputTokens: 150000,
      cost: null,
      unpricedQuestions: 2,
      unpricedTokens: 1650000
    });
    expect(data.byModel).toEqual([
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        questions: 2,
        cost: null,
        price: null
      })
    ]);
  });

  it('costs each question at the price kept with it, per million tokens', async () => {
    await answered({ price: SONNET_PRICE });
    // 1,000,000 in at 3 + 100,000 out at 15 per million.
    const data = await report();
    expect(data.totals).toMatchObject({ cost: 4.5, unpricedQuestions: 0, unpricedTokens: 0 });
    expect(data.currency).toBe('USD');
  });

  it('keeps what a question cost when the price changes afterwards, and prices later questions at the new one', async () => {
    await answered({ price: SONNET_PRICE, finishedAt: daysAgo(3) });
    // The price drops: only what is asked after it is affected.
    await putPrices(ADMIN, { currency: 'USD', entries: [{ ...sonnet, inputPerMillion: 1, outputPerMillion: 5 }] });
    await answered({ price: asked(1, 5) });
    const data = await report();
    expect(data.byDay.map((row) => row.cost)).toEqual([4.5, 1.5]);
    expect(data.totals.cost).toBe(6);
    // The table shows what a question asked now costs; the row says the price changed within the period.
    expect(data.byModel[0]).toMatchObject({
      cost: 6,
      pricesInPeriod: 2,
      price: stored({ ...sonnet, inputPerMillion: 1, outputPerMillion: 5 })
    });
  });

  it('stamps the price in effect on an answer when it is given, and nothing where there is none', async () => {
    // Done by the worker as a question completes, the same way for the first and any later one.
    const { priceSnapshot } = await import('../services/usage');
    expect(await priceSnapshot('anthropic', 'claude-sonnet-5-5')).toBeNull();
    await putPrices(ADMIN, { currency: 'eur', entries: [sonnet] });
    expect(await priceSnapshot('anthropic', 'claude-sonnet-5-5')).toEqual({
      currency: 'EUR',
      inputPerMillion: 3,
      outputPerMillion: 15,
      source: 'manual',
      backfilled: false
    });
    expect(await priceSnapshot('openai', 'gpt-5.1')).toBeNull();
  });

  it('prices questions asked before their model had a price, only when asked to, and says so', async () => {
    await answered();
    await answered({ price: asked(1, 1) });
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    // Setting a price does not touch what was already answered.
    let data = await report();
    expect(data.totals).toMatchObject({ questions: 2, unpricedQuestions: 1, cost: 1.1 });
    expect(data.backfilledQuestions).toBe(0);
    const response = await fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
      method: 'POST',
      headers: { 'x-test-user': ADMIN }
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: object }).data).toEqual({
      questions: 1,
      models: [{ model: 'claude-sonnet-5-5', questions: 1 }]
    });
    data = await report();
    // The one that already had a price keeps it; the other is costed at today's, and counted as backfilled.
    expect(data.totals).toMatchObject({ unpricedQuestions: 0, cost: 1.1 + 4.5 });
    expect(data.backfilledQuestions).toBe(1);
    // Doing it again changes nothing.
    const again = await fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
      method: 'POST',
      headers: { 'x-test-user': ADMIN }
    });
    expect(((await again.json()) as { data: { questions: number } }).data.questions).toBe(0);
  });

  it('backfills only the models that now have a price, and is for administrators only', async () => {
    await answered();
    await answered({ provider: 'openai', model: 'gpt-5.1' });
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    const post = (user: string) =>
      fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
        method: 'POST',
        headers: { 'x-test-user': user }
      });
    expect((await post('alice')).status).toBe(403);
    expect(((await (await post(ADMIN)).json()) as { data: { questions: number } }).data.questions).toBe(1);
    expect((await report()).totals).toMatchObject({ unpricedQuestions: 1 });
    expect(await AssistantRun.countDocuments({ 'price.backfilled': true })).toBe(1);
  });

  it('adds no money across currencies: where a period has prices in two, there is no total', async () => {
    await answered({ price: asked(3, 15, 'USD') });
    expect((await report()).currency).toBe('USD');
    await answered({ price: asked(3, 15, 'EUR'), inputTokens: 10, outputTokens: 10 });
    const data = await report();
    expect(data.currency).toBe('MIXED');
    expect(data.totals.cost).toBeNull();
    expect(data.totals.questions).toBe(2);
    expect(data.byModel[0].cost).toBeNull();
  });

  it('splits the cost by model, day and person, and prices only what has a price', async () => {
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    await answered({ price: SONNET_PRICE, finishedAt: daysAgo(2) });
    await answered({
      price: SONNET_PRICE,
      finishedAt: daysAgo(2, 23),
      userId: 'bob',
      name: 'Bob',
      inputTokens: 2000000,
      outputTokens: 0
    });
    await answered({ provider: 'openai', model: 'gpt-5.1', inputTokens: 400000, outputTokens: 40000 });
    const data = await report();
    expect(data.totals).toMatchObject({ questions: 3, cost: 4.5 + 6, unpricedTokens: 440000 });
    // Oldest day first, each with its own tokens and cost.
    expect(data.byDay.map((d) => d.day)).toEqual([
      daysAgo(2).toISOString().slice(0, 10),
      daysAgo(0).toISOString().slice(0, 10)
    ]);
    expect(data.byDay[0]).toMatchObject({ questions: 2, cost: 4.5 + 6 });
    expect(data.byDay[1]).toMatchObject({ questions: 1, cost: null, unpricedTokens: 440000 });
    // Most money first; the unpriced model after.
    expect(data.byModel.map((m) => m.model)).toEqual(['claude-sonnet-5-5', 'gpt-5.1']);
    expect(data.byPerson.map((p) => [p.name, p.cost])).toEqual([
      ['Bob', 6],
      ['Alice', 4.5]
    ]);
  });

  it("adds one person's answers across models into one row, with the name they have now", async () => {
    await answered({ price: SONNET_PRICE, finishedAt: daysAgo(3), name: 'Alice Old' });
    await answered({ provider: 'openai', model: 'gpt-5.1', inputTokens: 1, outputTokens: 1, name: 'Alice New' });
    const people = (await report()).byPerson;
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ userId: 'alice', questions: 2, cost: 4.5, unpricedTokens: 2 });
    expect(people[0].name).toMatch(/^Alice (Old|New)$/);
  });

  it('counts only answers finished inside the window, in whole UTC days, and says how many failed', async () => {
    await answered({ finishedAt: daysAgo(0) });
    await answered({ finishedAt: daysAgo(6) });
    await answered({ finishedAt: daysAgo(7, 0) });
    await answered({ finishedAt: daysAgo(40) });
    expect((await report(7)).totals.questions).toBe(2);
    expect((await report(1)).totals.questions).toBe(1);
    expect((await report(90)).totals.questions).toBe(4);
    // Questions that did not finish used tokens nobody reported: counted as failures, never as spend.
    await answered({ state: 'failed', finishedAt: daysAgo(1), inputTokens: 0, outputTokens: 0 });
    await answered({ state: 'running', finishedAt: undefined });
    const data = await report(7);
    expect(data.totals.questions).toBe(2);
    expect(data.failedQuestions).toBe(1);
  });

  it('keeps answers that were recorded before the provider or model was, as their own unpriced row', async () => {
    await answered({ provider: undefined, model: undefined });
    expect((await report()).byModel).toEqual([
      expect.objectContaining({ provider: 'unknown', model: 'unknown', cost: null })
    ]);
  });

  it('takes a window of 1 to 365 days, and nothing else', async () => {
    expect((await usage(365)).status).toBe(200);
    for (const bad of ['0', '366', '1.5', 'abc', '-3'])
      expect((await request(`/settings/assistant/usage?days=${bad}`, ADMIN)).status).toBe(400);
  });

  it('refuses prices that are not prices, and keeps what it had', async () => {
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    const bad = (body: unknown) => putPrices(ADMIN, body);
    expect((await bad({ currency: 'dollars', entries: [] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, inputPerMillion: -1 }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, outputPerMillion: 100001 }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, inputPerMillion: '3' }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, provider: 'nobody' }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, model: '' }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, extra: 1 }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [sonnet, sonnet] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: new Array(201).fill(sonnet) })).status).toBe(400);
    expect((await bad({ entries: [] })).status).toBe(400);
    expect((await getPricingForTest()).entries).toEqual([stored(sonnet)]);
  });

  it('replaces the whole table, so a price is removed by leaving it out', async () => {
    const gpt = { provider: 'openai', model: 'gpt-5.1', inputPerMillion: 1.25, outputPerMillion: 10 };
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet, gpt] });
    await putPrices(ADMIN, { currency: 'USD', entries: [gpt] });
    expect((await getPricingForTest()).entries).toEqual([stored(gpt)]);
    await putPrices(ADMIN, { currency: 'USD', entries: [] });
    expect((await getPricingForTest()).entries).toEqual([]);
  });
});

const getPricingForTest = async () => (await Pricing.findById('pricing').lean()) as { entries: object[] };

describe('refreshing prices from the price list', () => {
  const LIST_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
  const list = {
    'claude-haiku-5-5': { litellm_provider: 'anthropic', input_cost_per_token: 1e-7, output_cost_per_token: 5e-7 },
    'claude-sonnet-5-5': { litellm_provider: 'anthropic', input_cost_per_token: 2e-6, output_cost_per_token: 1e-5 },
    'gpt-5.1': { litellm_provider: 'openai', input_cost_per_token: 1.25e-6, output_cost_per_token: 1e-5 }
  };
  let sequence = 0;
  const answered = (provider: string, model: string) =>
    AssistantRun.create({
      conversationId: 'c1',
      messageId: `price-m${++sequence}`,
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      state: 'completed',
      provider,
      model,
      inputTokens: 1000000,
      outputTokens: 100000,
      finishedAt: new Date()
    });
  const serve = (body: unknown, status = 200) =>
    (fetchWithTimeout as jest.Mock).mockImplementation(async (url: string) =>
      String(url).includes('model_prices') || String(url).includes('prices.test')
        ? new Response(JSON.stringify(body), { status })
        : new Response('{}', { status: 404 })
    );
  const refresh = (user = ADMIN) =>
    fetch(`${base}/api/chat/settings/assistant/prices/refresh`, { method: 'POST', headers: { 'x-test-user': user } });
  const putPrices = (body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/prices`, {
      method: 'PUT',
      headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const table = async () =>
    (await Pricing.findById('pricing').lean()) as { currency: string; entries: Record<string, unknown>[] } | null;

  beforeEach(async () => {
    await makeAdmin();
    (fetchWithTimeout as jest.Mock).mockClear();
  });
  afterEach(restoreFetch);

  it('is for administrators only, and fetches nothing for anyone else', async () => {
    serve(list);
    expect((await refresh('alice')).status).toBe(403);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('prices every model that has answered a question, per million tokens, marked as fetched', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await answered('openai', 'gpt-5.1');
    await answered('anthropic', 'claude-haiku-5-5');
    serve(list);
    const response = await refresh();
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { currency: string; entries: Record<string, unknown>[]; refresh: Record<string, unknown> };
    };
    expect((fetchWithTimeout as jest.Mock).mock.calls[0][0]).toBe(LIST_URL);
    expect(data.currency).toBe('USD');
    // 1e-7 per token is exactly 0.1 per million, not 0.09999999999999999.
    expect(data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'claude-haiku-5-5',
          inputPerMillion: 0.1,
          outputPerMillion: 0.5,
          source: 'fetched'
        }),
        expect.objectContaining({ model: 'gpt-5.1', inputPerMillion: 1.25, outputPerMillion: 10, source: 'fetched' })
      ])
    );
    expect(data.entries).toHaveLength(2);
    expect(data.refresh).toMatchObject({
      updated: expect.arrayContaining(['claude-haiku-5-5', 'gpt-5.1']),
      notFound: [],
      keptManual: []
    });
    expect(new Date(data.refresh.fetchedAt as string).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect((await table())?.entries.every((entry) => entry.source === 'fetched' && entry.fetchedAt)).toBe(true);
  });

  it('never overwrites a price an administrator typed, and says it left it alone', async () => {
    await answered('anthropic', 'claude-sonnet-5-5');
    await answered('anthropic', 'claude-haiku-5-5');
    await putPrices({
      currency: 'USD',
      entries: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 1.8, outputPerMillion: 9 }]
    });
    serve(list);
    const { data } = (await (await refresh()).json()) as {
      data: { entries: Record<string, unknown>[]; refresh: Record<string, unknown> };
    };
    expect(data.refresh).toMatchObject({ updated: ['claude-haiku-5-5'], keptManual: ['claude-sonnet-5-5'] });
    const sonnetEntry = data.entries.find((entry) => entry.model === 'claude-sonnet-5-5');
    expect(sonnetEntry).toMatchObject({ inputPerMillion: 1.8, outputPerMillion: 9, source: 'manual' });
  });

  it('updates a fetched price when the list changes, for questions asked from then on, not for those already answered', async () => {
    await answered('anthropic', 'claude-sonnet-5-5');
    serve(list);
    await refresh();
    const cost = async () => ((await request('/settings/assistant/usage', ADMIN)).body.data as UsageBody).totals.cost;
    // A refresh sets the price for questions to come: the one already answered had none, and is priced only on request.
    expect(await cost()).toBeNull();
    await fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
      method: 'POST',
      headers: { 'x-test-user': ADMIN }
    });
    expect(await cost()).toBe(2 + 1);
    serve({ ...list, 'claude-sonnet-5-5': { ...list['claude-sonnet-5-5'], input_cost_per_token: 4e-6 } });
    await refresh();
    // The table has the new price; what the answered question cost stays what it was.
    expect((await table())?.entries).toEqual([
      expect.objectContaining({ model: 'claude-sonnet-5-5', inputPerMillion: 4 })
    ]);
    expect(await cost()).toBe(2 + 1);
  });

  it('reports the models the list has no price for, and keeps the rest', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await answered('anthropic', 'claude-brand-new');
    serve(list);
    const { data } = (await (await refresh()).json()) as {
      data: { entries: unknown[]; refresh: Record<string, unknown> };
    };
    expect(data.refresh).toMatchObject({ updated: ['claude-haiku-5-5'], notFound: ['claude-brand-new'] });
    expect(data.entries).toHaveLength(1);
  });

  it("does not take a price that is not one, or one that belongs to another provider's model of the same name", async () => {
    for (const model of ['negative', 'text', 'huge', 'missing-output', 'wrong-provider', 'not-an-object'])
      await answered('openai', model);
    serve({
      negative: { litellm_provider: 'openai', input_cost_per_token: -1e-6, output_cost_per_token: 1e-6 },
      text: { litellm_provider: 'openai', input_cost_per_token: '1e-6', output_cost_per_token: 1e-6 },
      huge: { litellm_provider: 'openai', input_cost_per_token: 1, output_cost_per_token: 1 },
      'missing-output': { litellm_provider: 'openai', input_cost_per_token: 1e-6 },
      'wrong-provider': { litellm_provider: 'azure', input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 },
      'not-an-object': 'cheap'
    });
    const { data } = (await (await refresh()).json()) as {
      data: { entries: unknown[]; refresh: { updated: string[]; notFound: string[] } };
    };
    expect(data.refresh.updated).toEqual([]);
    expect(data.refresh.notFound.sort()).toEqual([
      'huge',
      'missing-output',
      'negative',
      'not-an-object',
      'text',
      'wrong-provider'
    ]);
    expect(data.entries).toEqual([]);
  });

  it('finds a model listed under its provider prefix', async () => {
    await answered('openai', 'gpt-5.1');
    serve({ 'openai/gpt-5.1': list['gpt-5.1'] });
    const { data } = (await (await refresh()).json()) as { data: { refresh: { updated: string[] } } };
    expect(data.refresh.updated).toEqual(['gpt-5.1']);
  });

  it('leaves the prices as they were when the list cannot be fetched or is not a list', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await putPrices({
      currency: 'USD',
      entries: [
        {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          inputPerMillion: 9,
          outputPerMillion: 9,
          source: 'fetched',
          fetchedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    });
    const before = JSON.stringify(await table());
    for (const [body, status] of [
      [list, 503],
      [[1, 2], 200],
      ['text', 200],
      [null, 200]
    ] as const) {
      serve(body, status);
      const response = await refresh();
      expect(response.status).toBe(502);
      expect(((await response.json()) as { message: string }).message).toContain('The prices are as they were');
    }
    (fetchWithTimeout as jest.Mock).mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    expect((await refresh()).status).toBe(502);
    expect(JSON.stringify(await table())).toBe(before);
  });

  it('refuses a list that announces itself as far too large, or a failure that carries no message', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    (fetchWithTimeout as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(list), { headers: { 'content-length': String(21 * 1024 * 1024) } })
    );
    expect((await refresh()).status).toBe(502);
    (fetchWithTimeout as jest.Mock).mockRejectedValue('offline');
    expect((await refresh()).status).toBe(502);
  });

  it('will not apply dollar prices to another currency, and does not even ask for the list', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await putPrices({ currency: 'EUR', entries: [] });
    serve(list);
    const response = await refresh();
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain('in USD, and prices here are in EUR');
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("reads LiteLLM's public list, whatever the environment says", async () => {
    await answered('openai', 'gpt-5.1');
    process.env.ANALYST_PRICE_LIST_URL = 'https://prices.test/list.json';
    try {
      serve(list);
      expect((await refresh()).status).toBe(200);
      expect((fetchWithTimeout as jest.Mock).mock.calls[0][0]).toBe(
        'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
      );
    } finally {
      delete process.env.ANALYST_PRICE_LIST_URL;
    }
  });

  it('keeps a fetched price marked as fetched when it is saved back unchanged, and a typed one as manual', async () => {
    const fetched = {
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      inputPerMillion: 0.1,
      outputPerMillion: 0.5,
      source: 'fetched',
      fetchedAt: '2026-11-02T10:00:00.000Z'
    };
    const typed = { provider: 'openai', model: 'gpt-5.1', inputPerMillion: 1, outputPerMillion: 2 };
    expect((await putPrices({ currency: 'USD', entries: [fetched, typed] })).status).toBe(200);
    expect((await table())?.entries).toEqual([
      expect.objectContaining({ model: 'claude-haiku-5-5', source: 'fetched' }),
      expect.objectContaining({ model: 'gpt-5.1', source: 'manual', fetchedAt: null })
    ]);
    expect((await putPrices({ currency: 'USD', entries: [{ ...fetched, fetchedAt: 'yesterday' }] })).status).toBe(400);
    expect((await putPrices({ currency: 'USD', entries: [{ ...fetched, source: 'magic' }] })).status).toBe(400);
  });
});

describe('the price kept with an answer', () => {
  const putPrices = (body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/prices`, {
      method: 'PUT',
      headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const ask = async (clientId: string) => {
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId });
    const worker = startWorker();
    worker();
    await worker.tick();
    return AssistantRun.findOne({ conversationId: id }).lean();
  };

  beforeEach(async () => {
    await makeAdmin();
    await enableAnalyst('claude-sonnet-5-5');
  });

  it('is stamped on the question as it completes, at the price in effect then', async () => {
    await putPrices({
      currency: 'USD',
      entries: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 3, outputPerMillion: 15 }]
    });
    const first = await ask('priced-question-1');
    expect(first?.price).toEqual({
      currency: 'USD',
      inputPerMillion: 3,
      outputPerMillion: 15,
      source: 'manual',
      backfilled: false
    });
    // The price changes: the next question is stamped with the new one, and the first keeps its own.
    await putPrices({
      currency: 'USD',
      entries: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 1, outputPerMillion: 5 }]
    });
    const second = await ask('priced-question-2');
    expect(second?.price).toMatchObject({ inputPerMillion: 1, outputPerMillion: 5 });
    expect((await AssistantRun.findById(first?._id).lean())?.price).toMatchObject({
      inputPerMillion: 3,
      outputPerMillion: 15
    });
  });

  it('is left off where the model had no price, so it can be priced afterwards on request', async () => {
    const run = await ask('unpriced-question-1');
    expect(run?.state).toBe('completed');
    expect(run?.price).toBeUndefined();
  });
});
