import '../helpers/mocks';
import mongoose from 'mongoose';
import { Assistant } from '../../models/Assistant';
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
