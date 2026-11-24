import '../helpers/mocks';
import { vi } from 'vitest';
import { BadRequestError } from '@visin/backend-core';
import * as assistants from '../../services/assistantClient';
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

it('rejects assistant sends the assistant service refuses, while human messaging still works', async () => {
  const id = await create('assistant', []);
  vi.mocked(assistants.prepare).mockRejectedValueOnce(new BadRequestError('The assistant is not configured. Human messaging is available.'));
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

describe('searching a conversation', () => {
  const say = (id: string, user: string, body: string, clientId: string) =>
    request(`/conversations/${id}/messages`, user, { body, clientId });
  type Found = { body: string; seq: number }[];
  const search = (id: string, user: string, q: string, extra = '') =>
    request<Found>(`/conversations/${id}/messages/search?q=${encodeURIComponent(q)}${extra}`, user);

  /** A direct conversation both people are in, so either may keep writing. */
  const joined = async () => {
    const id = await create();
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    return id;
  };
  it('finds messages containing the text in any case, newest first, taking the text literally', async () => {
    const id = await joined();
    await say(id, 'alice', 'Dinner at the Italian place', 'search-msg-001');
    await say(id, 'alice', 'Nothing relevant', 'search-msg-002');
    await say(id, 'alice', 'italian again (really?)', 'search-msg-003');
    const found = await search(id, 'alice', 'ITALIAN');
    expect(found.status).toBe(200);
    expect(found.body.data.map((m: { body: string }) => m.body)).toEqual([
      'italian again (really?)',
      'Dinner at the Italian place'
    ]);
    // Characters with a meaning in a pattern are only characters.
    expect((await search(id, 'alice', '(really?)')).body.data).toHaveLength(1);
    expect((await search(id, 'alice', '.*')).body.data).toHaveLength(0);
    // Nothing the stored outbox or owner fields are shown.
    expect(JSON.stringify(found.body.data)).not.toContain('assistantRequest');
  });

  it('pages back with the oldest sequence, and refuses terms that are too short or too long', async () => {
    const id = await joined();
    // Written directly: the send route is limited to 30 a minute.
    for (let i = 0; i < 35; i++)
      await appendMessage({
        conversationId: id,
        senderId: 'alice',
        senderName: 'Alice',
        kind: 'person',
        body: `match number ${i}`,
        clientId: `search-page-${String(i).padStart(3, '0')}`
      });
    const first = await search(id, 'alice', 'match');
    expect(first.body.data).toHaveLength(30);
    const oldest = first.body.data.at(-1)!.seq;
    const second = await search(id, 'alice', 'match', `&before=${oldest}`);
    expect(second.body.data).toHaveLength(5);
    expect(second.body.data.every((m: { seq: number }) => m.seq < oldest)).toBe(true);
    expect((await search(id, 'alice', 'a')).status).toBe(400);
    expect((await search(id, 'alice', 'x'.repeat(101))).status).toBe(400);
    expect((await request(`/conversations/${id}/messages/search`, 'alice')).status).toBe(400);
  });

  it('never returns unsent messages, and never searches a conversation the caller is not in', async () => {
    const id = await joined();
    const sent = await say(id, 'alice', 'a secret plan', 'search-unsent-1');
    await say(id, 'alice', 'a public plan', 'search-unsent-2');
    await request(`/conversations/${id}/messages/${sent.body.data._id}/unsend`, 'alice', {});
    expect((await search(id, 'alice', 'plan')).body.data.map((m: { body: string }) => m.body)).toEqual([
      'a public plan'
    ]);
    expect((await search(id, 'mallory', 'plan')).status).toBe(404);
  });

  it('only searches what a room member could already read', async () => {
    const id = await create('room', ['bob']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    await say(id, 'alice', 'before bob joined: budget', 'search-room-001');
    await request(`/conversations/${id}/participants`, 'alice', { handle: 'charlie' });
    await request(`/conversations/${id}/membership`, 'charlie', { action: 'accept' });
    await say(id, 'alice', 'after charlie joined: budget', 'search-room-002');
    const seen = (await search(id, 'charlie', 'budget')).body.data.map((m: { body: string }) => m.body);
    expect(seen).toEqual(['after charlie joined: budget']);
  });
});
