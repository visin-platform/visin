import '../helpers/mocks';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { appendMessage } from '../../services/messages';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

it('deduplicates message retries and never overwrites their original body', async () => {
  const id = await create();
  const body = { body: 'A question', clientId: 'retry-123456' };
  const first = await request(`/conversations/${id}/messages`, 'alice', body);
  const retry = await request(`/conversations/${id}/messages`, 'alice', { ...body, body: 'Changed' });
  expect(first.body.data._id).toBe(retry.body.data._id);
  expect(retry.body.data.body).toBe('A question');
  expect(await Message.countDocuments()).toBe(1);
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

it('saves a bounded server-authored quote and keeps it stable on retries', async () => {
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const source = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'A'.repeat(600),
    clientId: 'quote-source-001'
  });
  const reply = await request(`/conversations/${id}/messages`, 'bob', {
    body: 'My reply',
    clientId: 'quote-reply-001',
    replyTo: source.body.data._id
  });
  expect(reply.status).toBe(201);
  expect(reply.body.data.quote).toEqual({
    messageId: source.body.data._id,
    senderName: 'alice',
    kind: 'person',
    body: 'A'.repeat(500)
  });
  await Message.updateOne({ _id: source.body.data._id }, { $set: { body: 'Changed source' } });
  const retry = await request(`/conversations/${id}/messages`, 'bob', {
    body: 'Changed reply',
    clientId: 'quote-reply-001',
    replyTo: source.body.data._id
  });
  expect(retry.status).toBe(200);
  expect(retry.body.data.quote).toEqual(reply.body.data.quote);
  expect(retry.body.data.body).toBe('My reply');
});

it('rejects client-authored quotes and reply targets outside the conversation', async () => {
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const other = await create('room', ['charlie']);
  const source = await request(`/conversations/${other}/messages`, 'alice', {
    body: 'Other conversation',
    clientId: 'other-quote-source'
  });
  expect(
    (
      await request(`/conversations/${id}/messages`, 'bob', {
        body: 'Reply',
        clientId: 'foreign-quote-001',
        replyTo: source.body.data._id
      })
    ).status
  ).toBe(400);
  expect(
    (
      await request(`/conversations/${id}/messages`, 'bob', {
        body: 'Reply',
        clientId: 'spoofed-quote-001',
        quote: { body: 'Forged' }
      })
    ).status
  ).toBe(400);
});

it('does not republish pre-join room history through quoted replies', async () => {
  const id = await create('room');
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const old = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Before Charlie joined',
    clientId: 'before-charlie-001'
  });
  await request(`/conversations/${id}/participants`, 'alice', { handle: 'charlie' });
  await request(`/conversations/${id}/membership`, 'charlie', { action: 'accept' });
  for (const user of ['alice', 'charlie']) {
    expect(
      (
        await request(`/conversations/${id}/messages`, user, {
          body: 'Quote old history',
          clientId: `old-quote-${user}`,
          replyTo: old.body.data._id
        })
      ).status
    ).toBe(400);
  }
  const recent = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Everyone can see this',
    clientId: 'after-charlie-001'
  });
  const reply = await request(`/conversations/${id}/messages`, 'bob', {
    body: 'Agreed',
    clientId: 'recent-quote-001',
    replyTo: recent.body.data._id
  });
  expect(reply.status).toBe(201);
  const visible = await request(`/conversations/${id}/messages`, 'charlie');
  expect(JSON.stringify(visible.body.data)).not.toContain('Before Charlie joined');
  expect(JSON.stringify(visible.body.data)).toContain('Everyone can see this');
});
