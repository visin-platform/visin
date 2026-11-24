import '../helpers/mocks';
import { expect, it, vi } from 'vitest';
import { BadRequestError } from '@visin/backend-core';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import * as assistants from '../../services/assistantClient';
import { listen } from '../../services/wakeBus';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

// A question to an assistant is a message first: chat stores it, with a hidden request for the assistant service's
// worker to find, and tells it so.
it('stores a question with its hidden request, and keeps the request out of what anyone reads', async () => {
  const id = await create('assistant', []);
  const sent = await request(`/conversations/${id}/messages`, 'alice', { body: 'Explain validation', clientId: 'assistant-001' });
  expect(sent.status).toBe(201);
  expect(sent.body.data.assistantRequest).toBeUndefined();
  const stored = await Message.findOne({ conversationId: id }).select('+assistantRequest');
  expect(stored?.assistantRequest).toMatchObject({ userId: 'alice', membershipVersion: 1 });
  expect(JSON.stringify((await request(`/conversations/${id}/messages`)).body.data)).not.toContain('assistantRequest');
});

it('puts the question to an assistant as the person who asks, in this conversation, at its membership version', async () => {
  const id = await create('assistant', []);
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Which is best?', clientId: 'assistant-002', screen: { tabId: 'tab-12345', path: '/projects' } });
  expect(assistants.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      person: { id: 'alice', email: 'alice@test.invalid', name: 'alice' },
      conversationId: id,
      membershipVersion: 1,
      screen: { tabId: 'tab-12345', path: '/projects' }
    })
  );
});

it('refuses a question the assistant service refuses, with its words, and stores nothing', async () => {
  const id = await create('assistant', []);
  vi.mocked(assistants.prepare).mockRejectedValueOnce(new BadRequestError('This assistant is paused or removed'));
  const refused = await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'assistant-003' });
  expect(refused.status).toBe(400);
  expect(refused.body.message).toBe('This assistant is paused or removed');
  expect(await Message.countDocuments({ conversationId: id })).toBe(0);
});

it('binds a thread that had no assistant to the one the assistant service chose, once', async () => {
  const id = await create('assistant', []);
  await Conversation.updateOne({ _id: id }, { $unset: { assistantId: 1 } });
  vi.mocked(assistants.prepare).mockResolvedValueOnce({
    bindAssistantId: 'default-bot',
    request: { userId: 'alice', email: 'alice@test.invalid', name: 'alice', assistantId: 'default-bot', assistantName: 'Default', membershipVersion: 1 }
  });
  expect((await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'assistant-004' })).status).toBe(201);
  expect((await Conversation.findById(id))?.assistantId).toBe('default-bot');
});

it('asks again for the assistant that is bound when another got there first', async () => {
  const id = await create('assistant', []);
  await Conversation.updateOne({ _id: id }, { $unset: { assistantId: 1 } });
  const request1 = { userId: 'alice', email: 'alice@test.invalid', name: 'alice', membershipVersion: 1 };
  vi.mocked(assistants.prepare)
    .mockImplementationOnce(async () => {
      // Another tab bound the thread to its own assistant between the question being prepared and it being pinned.
      await Conversation.updateOne({ _id: id }, { $set: { assistantId: 'other-bot' } });
      return { bindAssistantId: 'default-bot', request: { ...request1, assistantId: 'default-bot' } };
    })
    .mockImplementationOnce(async (input) => ({ request: { ...request1, assistantId: input.assistantId ?? 'none' } }));
  expect((await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'assistant-005' })).status).toBe(201);
  expect((await Conversation.findById(id))?.assistantId).toBe('other-bot');
  expect((await Message.findOne({ conversationId: id }).select('+assistantRequest'))?.assistantRequest?.assistantId).toBe('other-bot');
});

it('wakes the worker and the conversation’s streams when a question is saved', async () => {
  const id = await create('assistant', []);
  const woken = vi.fn();
  const off = listen('worker', woken);
  const stream = vi.fn();
  const offStream = listen(`conv:${id}`, stream);
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Ping', clientId: 'wake-question-2' });
  off();
  offStream();
  expect(woken).toHaveBeenCalled();
  expect(stream).toHaveBeenCalled();
});
