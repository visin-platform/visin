import '../helpers/mocks';
import { Conversation } from '../../models/Conversation';
import * as assistants from '../../services/assistantClient';
import { ConversationHidden } from '../../models/ConversationHidden';
import { Message } from '../../models/Message';
import { appendMessage } from '../../services/messages';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

const listed = async (user = 'alice', query = '') =>
  (await request<{ _id: string }[]>(`/conversations${query}`, user)).body.data.map((c) => c._id);
const vivi = async (user = 'alice') =>
  String((await request('/conversations', user, { kind: 'assistant', title: 'Vivi' })).body.data._id);
const ask = (id: string, body: string, clientId: string, user = 'alice', extra: object = {}) =>
  request(`/conversations/${id}/messages`, user, { body, clientId, ...extra });

describe('hiding', () => {
  it('puts a conversation away for one person, and brings it back', async () => {
    const id = await create('direct', ['bob']);
    expect((await request(`/conversations/${id}/hide`, 'alice', {})).status).toBe(200);
    expect(await listed()).not.toContain(id);
    expect(await listed('alice', '?hidden=1')).toEqual([id]);
    // Bob's list is his own.
    expect(await listed('bob')).toContain(id);
    expect((await request(`/conversations/${id}/hide`, 'alice', undefined, 'DELETE')).status).toBe(200);
    expect(await listed()).toContain(id);
    expect(await ConversationHidden.countDocuments()).toBe(0);
  });

  it('cannot hide what the person cannot see', async () => {
    const id = await create('direct', ['bob']);
    expect((await request(`/conversations/${id}/hide`, 'eve', {})).status).toBe(404);
    expect(await ConversationHidden.countDocuments()).toBe(0);
  });

  it('comes back when someone else writes in it, and when the person writes in it', async () => {
    const id = await create('room', ['bob']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    await request(`/conversations/${id}/hide`, 'alice', {});
    expect(await listed()).not.toContain(id);
    await ask(id, 'Anyone there?', 'room-from-bob-1', 'bob');
    expect(await listed()).toContain(id);
    expect(await ConversationHidden.countDocuments()).toBe(0);

    await request(`/conversations/${id}/hide`, 'alice', {});
    expect(await listed()).not.toContain(id);
    await ask(id, 'Yes', 'room-from-alice-1');
    expect(await listed()).toContain(id);
  });

  it('is not undone by the assistant answering, but asking the assistant again opens the chat', async () => {
    const id = await vivi();
    await request(`/conversations/${id}/hide`, 'alice', {});
    await appendMessage({
      conversationId: id,
      senderId: 'assistant:analyst',
      senderName: 'Vivi',
      kind: 'assistant',
      body: 'An answer',
      clientId: 'answer-while-hidden'
    });
    expect(await listed()).not.toContain(id);
    expect(await vivi()).toBe(id);
    expect(await listed()).toContain(id);
  });
});

describe('deleting', () => {
  it('soft-deletes the chat with the assistant: unreachable, still stored, and the next one is empty', async () => {
    const id = await vivi();
    await ask(id, 'Hello', 'before-delete-001');
    expect((await request(`/conversations/${id}`, 'alice', undefined, 'DELETE')).status).toBe(200);

    expect((await request(`/conversations/${id}`)).status).toBe(404);
    expect((await request(`/conversations/${id}/messages`)).status).toBe(404);
    expect((await ask(id, 'Still there?', 'after-delete-0001')).status).toBe(404);
    expect(await listed()).not.toContain(id);
    // Nothing was removed.
    const stored = await Conversation.findById(id);
    expect(stored?.deletedAt).toBeTruthy();
    expect(stored?.bindingKey).toBeUndefined();
    expect(stored?.deletedBindingKey).toBe('assistant:default:alice');
    expect(await Message.countDocuments({ conversationId: id })).toBe(1);
    // A question still waiting for its answer is cancelled with it, so no worker picks it up: the assistant service is
    // asked to cancel this person's open questions in the chat, and takes their requests back from chat in turn.
    expect(assistants.cancelRuns).toHaveBeenCalledWith({ conversationId: id, userId: 'alice' });

    const next = await vivi();
    expect(next).not.toBe(id);
    expect((await request(`/conversations/${next}/messages`)).body.data).toEqual([]);
  });

  it('deletes the chat while the assistant service cannot be reached', async () => {
    const id = await vivi();
    vi.mocked(assistants.cancelRuns).mockRejectedValueOnce(new Error('assistant-service is away'));
    expect((await request(`/conversations/${id}`, 'alice', undefined, 'DELETE')).status).toBe(200);
    expect((await Conversation.findById(id))?.deletedAt).toBeTruthy();
  });

  it('is only for your own chat with an assistant', async () => {
    const direct = await create('direct', ['bob']);
    expect((await request(`/conversations/${direct}`, 'alice', undefined, 'DELETE')).status).toBe(403);
    const room = await create('room', ['bob']);
    expect((await request(`/conversations/${room}`, 'alice', undefined, 'DELETE')).status).toBe(403);
    // Not someone else's chat either: it is not theirs to see.
    const mine = await vivi();
    expect((await request(`/conversations/${mine}`, 'bob', undefined, 'DELETE')).status).toBe(404);
    expect((await Conversation.findById(direct))?.deletedAt).toBeNull();
  });

  it('does not show a chat with an assistant from before there was one per person', async () => {
    const old = await Conversation.create({
      kind: 'assistant',
      title: 'IseAuto trainings',
      createdBy: 'alice',
      participants: [{ userId: 'alice', name: 'alice', state: 'active', role: 'owner', joinedAt: new Date() }]
    });
    expect(await listed()).not.toContain(old.id);
    expect((await request(`/conversations/${old.id}/messages`)).status).toBe(404);
    // A new one is not held back by it.
    expect(await vivi()).not.toBe(old.id);
  });
});
