import '../helpers/mocks';
import { Message } from '../../models/Message';
import { Conversation } from '../../models/Conversation';
import { AssistantRun } from '../../models/AssistantRun';
import { appendMessage } from '../../services/messages';
import { create, request, setupChatTests } from '../helpers/testServer';
setupChatTests();
const direct = async () => {
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  return id;
};
const send = async (id: string) =>
  (await request(`/conversations/${id}/messages`, 'alice', { body: 'Original text', clientId: 'original-message-1' }))
    .body.data;
it('adds, replaces and removes a reaction idempotently, with at most one per person', async () => {
  const id = await direct();
  const message = await send(id);
  const path = `/conversations/${id}/messages/${message._id}/reaction`;
  for (let i = 0; i < 2; i++) expect((await request(path, 'bob', { emoji: '❤️' })).status).toBe(200);
  expect((await Message.findById(message._id))?.reactions).toHaveLength(1);
  await Promise.all([request(path, 'bob', { emoji: '😂' }), request(path, 'alice', { emoji: '👍' })]);
  const updated = await Message.findById(message._id);
  expect(updated?.reactions.map((reaction) => reaction.userId).sort()).toEqual(['alice', 'bob']);
  expect(updated?.reactions.find((reaction) => reaction.userId === 'bob')?.emoji).toBe('😂');
  await request(path, 'bob', { emoji: null });
  expect((await Message.findById(message._id))?.reactions.map((reaction) => reaction.userId)).toEqual(['alice']);
  expect((await request(path, 'alice', { emoji: '<script>' })).status).toBe(400);
  expect((await request(path, 'outsider', { emoji: '👍' })).status).toBe(404);
});
it('only lets the sender unsend a person message and redacts quoted copies', async () => {
  const id = await direct();
  const message = await send(id);
  const reply = await request(`/conversations/${id}/messages`, 'bob', {
    body: 'A reply',
    clientId: 'reply-message-1',
    replyTo: message._id
  });
  expect(reply.status).toBe(201);
  expect((await request(`/conversations/${id}/messages/${message._id}/unsend`, 'bob', {})).status).toBe(403);
  const removed = await request(`/conversations/${id}/messages/${message._id}/unsend`, 'alice', {});
  expect(removed.status).toBe(200);
  expect(removed.body.data).toMatchObject({ body: '', unsentAt: expect.any(String), reactions: [] });
  const rows = (await request<Record<string, unknown>[]>(`/conversations/${id}/messages`, 'bob')).body.data;
  expect(JSON.stringify(rows)).not.toContain('Original text');
  expect(rows.find((row) => row.quote)).toMatchObject({ quote: { body: 'Message unsent', unsent: true } });
  expect((await request(`/conversations/${id}/messages/${message._id}/reaction`, 'bob', { emoji: '👍' })).status).toBe(
    400
  );
  expect(
    (
      await request(`/conversations/${id}/messages`, 'bob', {
        body: 'reply',
        clientId: 'reply-after-unsend',
        replyTo: message._id
      })
    ).status
  ).toBe(400);
  expect((await request(`/conversations/${id}/messages/${message._id}/unsend`, 'alice', {})).status).toBe(200);
});
it('removes attachment references, stops queued analysis and does not permit reactions on system messages', async () => {
  const id = await direct();
  const source = await appendMessage({
    conversationId: id,
    senderId: 'alice',
    senderName: 'Alice',
    kind: 'person',
    body: '',
    clientId: 'attachment-reply-1',
    attachments: [{ fileId: `chat/${id}/photo.png`, name: 'photo.png', kind: 'image', mime: 'image/png', size: 123 }]
  });
  const reply = await request(`/conversations/${id}/messages`, 'bob', {
    body: 'Nice photo',
    clientId: 'reply-to-photo-1',
    replyTo: source.id
  });
  expect(reply.status).toBe(201);
  expect(reply.body.data).toMatchObject({ quote: { body: 'Sent a photo' } });
  const job = await AssistantRun.create({
    conversationId: id,
    messageId: source.id,
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    state: 'queued'
  });
  await request(`/conversations/${id}/messages/${source.id}/unsend`, 'alice', {});
  expect((await Message.findById(source.id))?.attachments).toBeUndefined();
  expect((await AssistantRun.findById(job.id))?.state).toBe('cancelled');
  const system = await appendMessage({
    conversationId: id,
    senderId: 'system',
    senderName: 'System',
    kind: 'system',
    body: 'Joined',
    clientId: 'system-message-1'
  });
  expect((await request(`/conversations/${id}/messages/${system.id}/reaction`, 'alice', { emoji: '👍' })).status).toBe(
    400
  );
  expect((await request(`/conversations/${id}/messages/${system.id}/unsend`, 'alice', {})).status).toBe(403);
  expect((await Conversation.findById(id))?.messageVersion).toBeGreaterThan(0);
});
it('enforces room history boundaries for message mutations', async () => {
  const id = await create('room', ['bob']);
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const message = await send(id);
  await Conversation.updateOne(
    { _id: id, 'participants.userId': 'bob' },
    { $set: { 'participants.$.joinedSeq': message.seq, 'participants.$.joinedAt': new Date() } }
  );
  expect((await request(`/conversations/${id}/messages/${message._id}/reaction`, 'bob', { emoji: '👍' })).status).toBe(
    404
  );
});
