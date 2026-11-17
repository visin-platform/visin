import '../helpers/mocks';
import { vi, type Mock } from 'vitest';
import { Conversation } from '../../models/Conversation';
import { ConversationHidden } from '../../models/ConversationHidden';
import { Message } from '../../models/Message';
import { peer } from '../../services/access';
import { analyze } from '../../services/analyst';
import { appendMessage } from '../../services/messages';
import { startWorker } from '../../services/worker';
import { enableAnalyst } from '../helpers/analystFixtures';
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
    await enableAnalyst('test');
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
    await enableAnalyst('test');
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
    // A question still waiting for its answer is cancelled with it, so no worker picks it up.
    const waiting = await Message.findOne({ conversationId: id }).select('+assistantRequest +assistantCancelled');
    expect(waiting?.assistantCancelled).toBe(true);
    expect(waiting?.assistantRequest).toBeUndefined();

    const next = await vivi();
    expect(next).not.toBe(id);
    expect((await request(`/conversations/${next}/messages`)).body.data).toEqual([]);
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

describe('what a question is about', () => {
  it('goes to the analyst with the question it belongs to, not with the chat', async () => {
    await enableAnalyst('test');
    const id = await vivi();
    const project = '111111111111111111111111';
    vi.mocked(peer).mockResolvedValueOnce({ _id: project, name: 'IseAuto', owner: { kind: 'user', id: 'alice' } });
    await ask(id, 'How is IseAuto?', 'about-first-0001', 'alice', { context: { projectId: project } });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.at(-1)![0]).toMatchObject({ projectId: project });

    // The next question is a general one, from another page: the project does not follow it.
    await ask(id, 'What is IoU?', 'about-second-001');
    await worker.tick();
    const general = (analyze as Mock).mock.calls.at(-1)![0];
    expect(general.projectId).toBeUndefined();
    expect(general.paperId).toBeUndefined();
    // The earlier question keeps the project it was about, so its answer is not taken for this one's.
    const first = JSON.parse(general.history[0].content);
    expect(first).toMatchObject({ question: 'How is IseAuto?', about: { project: 'IseAuto' } });
    expect(general.history.at(-1).content).toBe('What is IoU?');
  });

  it('forgets the questions before a new topic, and keeps them in the chat', async () => {
    await enableAnalyst('test');
    const id = await vivi();
    await ask(id, 'Before the topic', 'topic-before-0001');
    const worker = startWorker();
    worker();
    await worker.tick();
    const marker = await request(`/conversations/${id}/topic`, 'alice', {});
    expect(marker.status).toBe(201);
    expect(marker.body.data).toMatchObject({ kind: 'system', body: expect.stringContaining('New topic') });
    // Again straight away is the same topic, not a second line.
    const again = await request(`/conversations/${id}/topic`, 'alice', {});
    expect(again.body.data._id).toBe(marker.body.data._id);
    expect(await Message.countDocuments({ conversationId: id, kind: 'system' })).toBe(1);
    await ask(id, 'After the topic', 'topic-after-00001');
    await worker.tick();
    const input = (analyze as Mock).mock.calls.at(-1)![0];
    expect(input.history.map((turn: { content: string }) => turn.content)).toEqual(['After the topic']);
    const messages = (await request<{ body: string }[]>(`/conversations/${id}/messages`)).body.data;
    expect(messages.map((m) => m.body)).toContain('Before the topic');
    // Only a chat with an assistant has topics.
    expect((await request(`/conversations/${await create('direct', ['bob'])}/topic`, 'alice', {})).status).toBe(400);
  });
});
