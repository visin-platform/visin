import '../helpers/mocks';
import mongoose from 'mongoose';
import { expect, it, vi } from 'vitest';
import { Conversation } from '../../models/ChatConversation';
import { Message } from '../../models/ChatMessage';
import { AssistantLock, holdsLock, releaseLock, takeLock } from '../../models/AssistantLock';
import { assistantCapabilities } from '../../services/capabilities';
import { redactQuotes } from '../../services/quotes';
import * as settings from '../../services/settings';
import { chatMessages, seedRoom } from '../helpers/chatData';
import { base, request, setupAssistantTests } from '../helpers/testServer';

setupAssistantTests();

// This service's own state, held beside chat's: one turn at a time per conversation, and chat's quotes read as chat reads them.
it('holds a conversation for one run at a time, until its time is up or it is given back', async () => {
  expect(await takeLock('c1', 'run-1', 60000)).toBe(true);
  expect(await takeLock('c1', 'run-2', 60000)).toBe(false);
  expect(await holdsLock('c1', 'run-1')).toBe(true);
  expect(await holdsLock('c1', 'run-2')).toBe(false);
  await releaseLock('c1', 'run-2');
  expect(await holdsLock('c1', 'run-1')).toBe(true);
  await AssistantLock.updateOne({ _id: 'c1' }, { $set: { until: new Date(Date.now() - 1000) } });
  expect(await holdsLock('c1', 'run-1')).toBe(false);
  expect(await takeLock('c1', 'run-2', 60000)).toBe(true);
  await releaseLock('c1', 'run-2');
  expect(await AssistantLock.findById('c1')).toBeNull();
});

it('shows a quoted message as unsent once it was', async () => {
  const room = String((await seedRoom())._id);
  const quoted = await chatMessages.create({ conversationId: room, senderId: 'alice', senderName: 'Alice', kind: 'person', body: 'Secret', clientId: 'quote-source-1', seq: 1 });
  const rows = [{ conversationId: room, quote: { messageId: String(quoted._id), body: 'Secret', unsent: false } }];
  await redactQuotes([]);
  await redactQuotes(rows);
  expect(rows[0].quote.body).toBe('Secret');
  await chatMessages.updateOne({ _id: quoted._id }, { $set: { unsentAt: new Date() } });
  await redactQuotes(rows);
  expect(rows[0].quote).toMatchObject({ body: 'Message unsent', unsent: true });
});

it("says what Vivi adds to the capabilities a page reads, and that a person cannot configure it when the check fails", async () => {
  expect(await assistantCapabilities('alice')).toEqual({
    assistant: false,
    assistantModel: expect.objectContaining({ ready: false }),
    canConfigure: false
  });
  vi.spyOn(settings, 'isPlatformAdmin').mockRejectedValueOnce(new Error('auth down'));
  expect((await assistantCapabilities('alice')).canConfigure).toBe(false);
  vi.restoreAllMocks();
});

it('reads chat conversations and messages written without the newer fields, with their defaults', async () => {
  const db = mongoose.connection;
  const conversation = await db.collection('chatconversations').insertOne({ kind: 'room', title: 'Old', createdBy: 'alice', participants: [] });
  const message = await db.collection('chatmessages').insertOne({ conversationId: String(conversation.insertedId), senderId: 'alice', senderName: 'Alice', kind: 'person', body: 'Old', clientId: 'old-message-1', seq: 1 });
  const read = await Conversation.findById(conversation.insertedId);
  expect(read?.sharedAssistants).toMatchObject({ enabled: false, lockedOff: false });
  expect(read?.sharedAssistantIds).toEqual([]);
  expect((await Message.findById(message.insertedId))?.body).toBe('Old');
});

it('serves only its health and metrics as a worker, and nothing of the assistant API', async () => {
  const { createWorkerApp } = await import('../../app.js');
  const { createServer } = await import('node:http');
  const app = createWorkerApp();
  const server = createServer((req, res) => app(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const health = await fetch(`${url}/health`);
    expect(health.status).toBe(200);
    expect(JSON.stringify(await health.json())).toContain('assistant-worker');
    expect((await fetch(`${url}/metrics`)).status).toBe(200);
    for (const path of ['/api/assistant/assistants', '/api/assistant/internal/capabilities?userId=a', '/api/assistant/guest/capabilities'])
      expect((await fetch(`${url}${path}`)).status).toBe(404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  expect(base).toContain('http://');
});

it('tells a signed-in person what Vivi can do for them, and nobody else', async () => {
  const capabilities = await request('/capabilities', 'alice');
  expect(capabilities.status).toBe(200);
  expect(capabilities.body.data).toMatchObject({ assistant: false, canConfigure: false, assistantModel: { ready: false } });
  expect((await fetch(`${base}/api/assistant/capabilities`)).status).toBe(401);
});
