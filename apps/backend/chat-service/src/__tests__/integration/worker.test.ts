import '../helpers/mocks';
import { type Mock } from 'vitest';
import { AssistantRun } from '../../models/AssistantRun';
import { Budget } from '../../models/Budget';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { analyze } from '../../services/analyst';
import { appendMessage } from '../../services/messages';
import { startWorker } from '../../services/worker';
import { enableAnalyst } from '../helpers/analystFixtures';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

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
  const call = (analyze as Mock).mock.calls.at(-1)![0];
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
    { _id: String(sent.body.data._id) },
    { $set: { assistantCancelled: true }, $unset: { assistantRequest: 1 } }
  );
  await AssistantRun.create({
    conversationId: id,
    messageId: String(sent.body.data._id),
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    membershipVersion: 1,
    state: 'queued'
  });
  const before = (analyze as Mock).mock.calls.length;
  const worker = startWorker();
  worker();
  await worker.tick();
  expect((analyze as Mock).mock.calls.length).toBe(before);
  expect((await AssistantRun.findOne({ messageId: String(sent.body.data._id) }))?.state).toBe('cancelled');
  expect(await Budget.countDocuments()).toBe(0);
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
  (analyze as Mock).mockImplementation(async function () {
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

it('includes an authorized quoted conclusion as reference context for the current question', async () => {
  await enableAnalyst();
  const id = await create('assistant', []);
  const source = await appendMessage({
    conversationId: id,
    senderId: 'assistant:analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'A previous measured conclusion',
    clientId: 'quoted-conclusion-001'
  });
  const sent = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Explain this conclusion',
    clientId: 'explain-quote-001',
    replyTo: source.id
  });
  expect(sent.status).toBe(201);
  const worker = startWorker();
  worker();
  await worker.tick();
  const input = (analyze as Mock).mock.calls.at(-1)![0];
  expect(JSON.parse(input.history.at(-1).content)).toMatchObject({
    question: 'Explain this conclusion',
    quote: { body: 'A previous measured conclusion', senderName: 'Analyst' }
  });
});
