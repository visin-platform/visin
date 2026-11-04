import '../helpers/mocks';
import mongoose from 'mongoose';
import { publicPerson } from '../../services/access';
import { Assistant } from '../../models/Assistant';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { AssistantRun } from '../../models/AssistantRun';
import { createAssistant } from '../../services/assistantService';
import { saveAssistantProfile } from '../../services/assistantProfiles';
import { enableAnalyst } from '../helpers/analystFixtures';
import { startWorker } from '../../services/worker';
import { create, request, setupChatTests } from '../helpers/testServer';
setupChatTests();
async function publish() {
  const manager = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('users').insertOne({ _id: manager, handle: 'manager', profilePublic: true });
  const bot = await createAssistant(manager.toString(), { name: 'Research helper', personality: 'Explain evidence' });
  await saveAssistantProfile(manager.toString(), bot.id, {
    handle: 'research-helper',
    bio: 'Research bot',
    public: true
  });
  return { manager: manager.toString(), bot };
}
it('creates bot profiles dynamically and keeps legacy assistants private', async () => {
  const legacy = await Assistant.create({ createdBy: 'alice', name: 'Private' });
  const { bot, manager } = await publish();
  await saveAssistantProfile(manager, bot.id, { handle: 'research-helper', bio: 'Research bot', public: true });
  const identities = await mongoose.connection.collection('users').find({ assistantId: bot.id }).toArray();
  expect(identities).toHaveLength(1);
  expect(identities[0]).toMatchObject({ kind: 'assistant', profilePublic: true, roles: [], managerIds: [manager] });
  expect(identities[0].passwordHash).toBeUndefined();
  expect((await Assistant.findById(legacy.id))?.published).toBe(false);
  const catalog = await request('/assistants/catalog');
  expect(catalog.body.data).toEqual([expect.objectContaining({ _id: bot.id, name: 'Research helper' })]);
  expect(JSON.stringify(catalog.body.data)).not.toContain('personality');
  expect((await request(`/assistants/${bot.id}/profile`, 'alice', { handle: 'taken', public: true })).status).toBe(404);
  expect((await request(`/assistants/${bot.id}`, 'alice', { name: 'Taken' })).status).toBe(404);
});
it('rejects human handle collisions and supports manager unpublishing and pausing', async () => {
  const { manager, bot } = await publish();
  await expect(saveAssistantProfile(manager, bot.id, { handle: 'manager', public: true })).rejects.toThrow(
    'already taken'
  );
  expect((await mongoose.connection.collection('users').findOne({ handle: 'manager' }))?.kind).not.toBe('assistant');
  expect((await request(`/assistants/${bot.id}`, manager, { name: 'Research helper', paused: true })).status).toBe(200);
  expect((await mongoose.connection.collection('users').findOne({ assistantId: bot.id }))?.assistantPaused).toBe(true);
  await saveAssistantProfile(manager, bot.id, { handle: 'research-helper', public: false });
  expect((await request('/assistants/catalog')).body.data).toEqual([]);
});
it('lets another user ask a public bot privately using their own authority and budget', async () => {
  await enableAnalyst();
  const { bot } = await publish();
  const c = await request('/conversations', 'bob', { kind: 'assistant', title: bot.name, assistantId: bot.id });
  expect(c.status).toBe(201);
  const id = String(c.body.data._id);
  expect((await request(`/conversations/${id}/messages`, 'alice')).status).toBe(404);
  expect(
    (await request(`/conversations/${id}/messages`, 'bob', { body: 'Explain', clientId: 'public-bot-question' })).status
  ).toBe(201);
  const worker = startWorker();
  worker();
  await worker.tick();
  await worker.tick();
  expect(await Message.countDocuments({ conversationId: id, kind: 'assistant', senderName: bot.name })).toBe(1);
  expect((await AssistantRun.findOne({ conversationId: id }))?.userId).toBe('bob');
  const shared = await create('direct', ['bob']);
  await request(`/conversations/${shared}/membership`, 'bob', { action: 'accept' });
  expect(
    (await request(`/conversations/${shared}/assistants`, 'bob', { action: 'add', assistantId: bot.id })).status
  ).toBe(200);
  expect(
    (
      await request(`/conversations/${shared}/messages`, 'bob', {
        body: 'Explain',
        clientId: 'public-bot-shared',
        assistantId: bot.id
      })
    ).status
  ).toBe(403);
});

it('repairs an interrupted public-profile removal on a manager retry', async () => {
  const { manager, bot } = await publish();
  const users = mongoose.connection.collection('users');
  const write = vi.spyOn(users, 'updateOne').mockRejectedValueOnce(new Error('Temporary profile failure'));
  try {
    expect((await request(`/assistants/${bot.id}/delete`, manager, {})).status).toBe(500);
  } finally {
    write.mockRestore();
  }
  expect((await Assistant.findById(bot.id))?.deletedAt).toBeInstanceOf(Date);
  expect((await request(`/assistants/${bot.id}/delete`, 'outsider', {})).status).toBe(404);
  expect((await request(`/assistants/${bot.id}/delete`, manager, {})).status).toBe(200);
  expect((await users.findOne({ assistantId: bot.id }))?.profilePublic).toBe(false);
});

it('opens a public bot handle as private analysis and generates a reply without shared-assistant consent', async () => {
  await enableAnalyst();
  const { bot } = await publish();
  const identity = await mongoose.connection.collection('users').findOne({ assistantId: bot.id });
  vi.mocked(publicPerson).mockResolvedValueOnce({
    id: identity!._id.toString(),
    handle: 'research-helper',
    name: bot.name,
    kind: 'assistant',
    assistantId: bot.id
  });
  const opened = await request('/conversations', 'bob', {
    kind: 'direct', title: 'Research helper', handles: ['research-helper']
  });
  expect(opened.status).toBe(201);
  expect(opened.body.data).toMatchObject({ kind: 'assistant', assistantId: bot.id });
  const id = String(opened.body.data._id);
  expect((await request(`/conversations/${id}/messages`, 'bob', {
    body: 'Hello', clientId: 'bot-handle-question'
  })).status).toBe(201);
  const worker = startWorker();
  worker();
  await worker.tick();
  await worker.tick();
  expect(await Message.countDocuments({ conversationId: id, kind: 'assistant', senderName: bot.name })).toBe(1);
  expect((await request(`/conversations/${id}/messages`, 'alice')).status).toBe(404);
});

it.each(['list', 'send'] as const)('repairs an old bot message request through %s and replies to the next message only', async entry => {
  await enableAnalyst();
  const { bot } = await publish();
  const identity = await mongoose.connection.collection('users').findOne({ assistantId: bot.id });
  const legacy = await Conversation.create({
    kind: 'direct', title: bot.name, createdBy: 'bob', directKey: `bob:${identity!._id}`,
    requestSent: true, requestClientId: 'old-hello', seq: 1, lastMessageSeq: 1,
    participants: [
      { userId: 'bob', name: 'Bob', state: 'active', role: 'owner', joinedAt: new Date() },
      { userId: identity!._id.toString(), name: bot.name, state: 'invited', role: 'member' }
    ]
  });
  await Message.create({ conversationId: legacy.id, seq: 1, senderId: 'bob', senderName: 'Bob', kind: 'person', body: 'Hello', clientId: 'old-hello' });
  if (entry === 'list') {
    const [list, messages] = await Promise.all([
      request<object[]>('/conversations', 'bob'),
      request(`/conversations/${legacy.id}/messages`, 'bob')
    ]);
    expect(list.body.data).toContainEqual(expect.objectContaining({ _id: legacy.id, kind: 'assistant', assistantId: bot.id }));
    expect(messages.status).toBe(200);
  }
  expect(await AssistantRun.countDocuments({ conversationId: legacy.id })).toBe(0);
  expect((await request(`/conversations/${legacy.id}/messages`, 'bob', {
    body: 'Are you there?', clientId: 'new-question'
  })).status).toBe(201);
  const repaired = await Conversation.findById(legacy.id);
  expect(repaired?.participants.map(person => person.userId)).toEqual(['bob']);
  expect(repaired?.directKey).toBeUndefined();
  const worker = startWorker();
  worker();
  await worker.tick();
  await worker.tick();
  expect(await Message.countDocuments({ conversationId: legacy.id, kind: 'assistant' })).toBe(1);
  expect(await Message.countDocuments({ conversationId: legacy.id, body: 'Hello' })).toBe(1);
  expect((await request(`/conversations/${legacy.id}/messages`, 'alice')).status).toBe(404);
});
