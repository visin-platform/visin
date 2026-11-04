import '../helpers/mocks';
import { vi } from 'vitest';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { flushMembershipEvents } from '../../services/membershipAudit';
import { startWorker } from '../../services/worker';
import { create, request, setupChatTests } from '../helpers/testServer';
setupChatTests();

it('records room membership changes once and keeps old audit history behind the join boundary', async () => {
  const id = await create('room', ['bob']);
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  await request(`/conversations/${id}/participants`, 'alice', { handle: 'charlie' });
  await request(`/conversations/${id}/participants`, 'alice', { handle: 'charlie' });
  expect((await request<{ body: string }[]>(`/conversations/${id}/messages`, 'charlie')).body.data).toEqual([]);
  await request(`/conversations/${id}/membership`, 'charlie', { action: 'accept' });
  const history = await request<{ body: string }[]>(`/conversations/${id}/messages`, 'charlie');
  expect(history.body.data.map((m: { body: string }) => m.body)).toEqual(['charlie joined the conversation.']);
  await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'bob' });
  await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'bob' });
  await request(`/conversations/${id}/membership`, 'charlie', { action: 'leave' });
  expect((await Message.find({ conversationId: id }).sort({ seq: 1 })).map((m) => m.body)).toEqual([
    'bob joined the conversation.',
    'alice invited charlie.',
    'charlie joined the conversation.',
    'alice removed bob.',
    'charlie left the conversation.'
  ]);
  const c = await Conversation.findById(id).select('+membershipEvents');
  expect(c?.membershipEvents).toHaveLength(0);
  expect(c?.seq).toBe(5);
});

it('recovers a committed membership event after message persistence fails, even with assistants disabled', async () => {
  const id = await create('room', ['bob']);
  const write = vi.spyOn(Message, 'updateOne').mockRejectedValueOnce(new Error('Temporary write failure'));
  try {
    expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(500);
  } finally {
    write.mockRestore();
  }
  const c = await Conversation.findById(id).select('+membershipEvents');
  expect(c?.participants.find((p) => p.userId === 'bob')?.state).toBe('active');
  expect(c?.membershipEvents).toHaveLength(1);
  expect(await Message.countDocuments({ conversationId: id })).toBe(0);
  const worker = startWorker();
  worker();
  await worker.tick();
  await worker.tick();
  await flushMembershipEvents(id);
  expect(await Message.countDocuments({ conversationId: id, kind: 'system' })).toBe(1);
  expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(200);
  expect(await Message.countDocuments({ conversationId: id })).toBe(1);
  const response = await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  expect(response.body.data.membershipEvents).toBeUndefined();
});

it('does not overwrite a concurrent send when reserving the audit sequence', async () => {
  const id = await create('room', ['bob']);
  const save = Conversation.prototype.save;
  const intercept = vi.spyOn(Conversation.prototype, 'save').mockImplementationOnce(async function (
    this: InstanceType<typeof Conversation>
  ) {
    const { appendMessage } = await import('../../services/messages.js');
    await appendMessage({
      conversationId: id,
      senderId: 'alice',
      senderName: 'Alice',
      kind: 'person',
      body: 'Concurrent message',
      clientId: 'concurrent-audit-001'
    });
    return save.call(this);
  });
  try {
    expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(409);
  } finally {
    intercept.mockRestore();
  }
  expect((await Conversation.findById(id))?.participants.find((p) => p.userId === 'bob')?.state).toBe('invited');
  expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(200);
  expect((await Message.find({ conversationId: id }).sort({ seq: 1 })).map((m) => m.seq)).toEqual([1, 2]);
  expect(
    (await request<{ body: string }[]>(`/conversations/${id}/messages`, 'bob')).body.data.map(
      (m: { body: string }) => m.body
    )
  ).toEqual(['bob joined the conversation.']);
});
