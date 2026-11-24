import '../helpers/mocks';
import mongoose from 'mongoose';
import { vi, type Mock } from 'vitest';
import { Block } from '../../models/Block';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { verifyAbout } from '../../services/analysisContext';
import { groups, peer, publicPerson } from '../../services/access';
import * as assistants from '../../services/assistantClient';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

// Each case sets what vision, the groups and the assistants say for itself.
beforeEach(() => {
  vi.mocked(peer).mockReset();
  vi.mocked(publicPerson).mockReset();
  vi.mocked(assistants.resolve).mockReset();
  vi.mocked(assistants.resolve).mockImplementation(async (input) => (input.assistantId ? { id: input.assistantId, name: 'Bot' } : null));
});

const project = '111111111111111111111111';
const run = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const group = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const botId = 'cccccccccccccccccccccccc';
const paper = 'ffffffffffffffffffffffff';
const asBot = (assistantId?: string) =>
  vi.mocked(publicPerson).mockResolvedValueOnce({ id: 'bot-user', handle: 'helper', name: 'Helper', kind: 'assistant', ...(assistantId ? { assistantId } : {}) });

// Which kinds of conversation a person can open, and what each asks of them.
describe('opening a chat with a bot', () => {
  it('opens a bot’s handle as a private chat with that assistant, named for it', async () => {
    asBot(botId);
    const opened = await request('/conversations', 'bob', { kind: 'direct', title: 'x', handles: ['helper'] });
    expect(opened.status).toBe(201);
    expect(opened.body.data).toMatchObject({ kind: 'assistant', assistantId: botId, title: 'Bot' });
    expect(assistants.resolve).toHaveBeenCalledWith({ userId: 'bob', assistantId: botId });
  });

  it('says a bot with no assistant behind it is unavailable', async () => {
    asBot();
    expect((await request('/conversations', 'bob', { kind: 'direct', title: 'x', handles: ['helper'] })).status).toBe(404);
  });

  it('refuses an assistant the person may not use, and keeps assistants to private chats', async () => {
    vi.mocked(assistants.resolve).mockResolvedValueOnce(null);
    expect((await request('/conversations', 'alice', { kind: 'assistant', title: 'x', assistantId: 'dddddddddddddddddddddddd' })).status).toBe(404);
    expect((await request('/conversations', 'alice', { kind: 'room', title: 'x', handles: ['bob'], assistantId: botId })).status).toBe(400);
    expect((await request('/conversations', 'alice', { kind: 'assistant', title: 'x', handles: ['bob'] })).status).toBe(400);
    expect((await request('/conversations', 'alice', { kind: 'assistant', title: 'x', projectId: project })).status).toBe(400);
  });

  it('starts a private chat with the assistant the person chose as their default', async () => {
    vi.mocked(assistants.resolve).mockResolvedValueOnce({ id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'My default' });
    vi.mocked(assistants.resolve).mockResolvedValueOnce({ id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'My default' });
    const opened = await request('/conversations', 'alice', { kind: 'assistant', title: 'x' });
    expect(opened.body.data).toMatchObject({ assistantId: 'eeeeeeeeeeeeeeeeeeeeeeee', title: 'My default' });
  });

  it('opens its chat again rather than a second one, and shows the bot’s profile with it', async () => {
    const first = await request('/conversations', 'alice', { kind: 'assistant', title: 'Vivi' });
    const again = await request('/conversations', 'alice', { kind: 'assistant', title: 'Vivi' });
    expect(again.body.data._id).toBe(first.body.data._id);
    expect((await request(`/conversations/${first.body.data._id}`)).body.data).toMatchObject({ kind: 'assistant' });
  });
});

describe('opening a chat with people', () => {
  it('refuses to contact someone who blocked the person, or whom they blocked', async () => {
    await Block.create({ userId: 'bob', blockedId: 'alice' });
    expect((await request('/conversations', 'alice', { kind: 'direct', title: 'x', handles: ['bob'] })).status).toBe(403);
    await Block.deleteMany({});
    await Block.create({ userId: 'alice', blockedId: 'carol' });
    expect((await request('/conversations', 'alice', { kind: 'room', title: 'x', handles: ['carol'] })).status).toBe(403);
  });

  it('keeps protected results to a project analysis, and asks for what each kind needs', async () => {
    expect((await request('/conversations', 'alice', { kind: 'room', title: 'x', handles: ['bob'], projectId: project })).status).toBe(400);
    expect((await request('/conversations', 'alice', { kind: 'direct', title: 'x', handles: ['bob', 'carol'] })).status).toBe(400);
    expect((await request('/conversations', 'alice', { kind: 'room', title: 'x', handles: [] })).status).toBe(400);
    expect((await request('/conversations', 'alice', { kind: 'group', title: 'x' })).status).toBe(400);
    expect((await request('/conversations', 'alice', { kind: 'project', title: 'x' })).status).toBe(400);
    expect((await request('/conversations', 'alice', { kind: 'group', title: 'x', groupId: group, handles: ['bob'] })).status).toBe(400);
  });
});

describe('opening a channel', () => {
  it('lets a group’s administrators open a channel for it, and no one else', async () => {
    (groups.checkMembership as Mock).mockResolvedValueOnce({ member: true, role: 'member' });
    expect((await request('/conversations', 'alice', { kind: 'group', title: 'Lab', groupId: group })).status).toBe(403);
    (groups.checkMembership as Mock).mockResolvedValue({ member: true, role: 'admin' });
    const opened = await request('/conversations', 'alice', { kind: 'group', title: 'Lab', groupId: group });
    expect(opened.status).toBe(201);
    expect(opened.body.data).toMatchObject({ kind: 'group', groupId: group });
  });

  it('opens a discussion of a project for its owner or its owning group, with the runs it is about', async () => {
    const owned = { _id: project, name: 'IseAuto', owner: { kind: 'user', id: 'alice' } };
    vi.mocked(peer).mockImplementation(async (_service: string, path: string) =>
      (path.includes('/trainings/') ? { projectId: project, name: 'Night run' } : owned) as never
    );
    const opened = await request('/conversations', 'alice', { kind: 'project', title: 'x', projectId: project, trainingIds: [run] });
    expect(opened.status).toBe(201);
    expect(opened.body.data).toMatchObject({ kind: 'project', projectId: project, trainingLabels: [{ id: run, name: 'Night run' }] });
    // A run of another project is not part of this discussion.
    vi.mocked(peer).mockImplementation(async (_service: string, path: string) =>
      (path.includes('/trainings/') ? { projectId: 'other', name: 'Elsewhere' } : owned) as never
    );
    expect((await request('/conversations', 'alice', { kind: 'project', title: 'x', projectId: project, trainingIds: [run] })).status).toBe(400);
    // Someone else's private project is not theirs to discuss, and a group's is for its members.
    vi.mocked(peer).mockImplementation(async () => ({ _id: project, name: 'Theirs', owner: { kind: 'user', id: 'bob' } }) as never);
    expect((await request('/conversations', 'alice', { kind: 'project', title: 'x', projectId: project })).status).toBe(403);
    vi.mocked(peer).mockImplementation(async () => ({ _id: project, name: 'Group', owner: { kind: 'group', id: group } }) as never);
    expect((await request('/conversations', 'alice', { kind: 'project', title: 'x', projectId: project })).status).toBe(403);
    (groups.checkMembership as Mock).mockResolvedValue({ member: true, role: 'member' });
    expect((await request('/conversations', 'alice', { kind: 'project', title: 'x', projectId: project })).body.data).toMatchObject({ groupId: group });
  });
});

describe('what a question is about, as chat checks it', () => {
  const project1 = { _id: project, name: 'IseAuto', owner: { kind: 'user', id: 'alice' } };
  const ask = (id: string, clientId: string, context: object) =>
    request(`/conversations/${id}/messages`, 'alice', { body: 'How is it?', clientId, context });
  const sentContext = async (id: string) => (await Message.findOne({ conversationId: id }))?.context;

  it('names the project and its runs, as the asker may read them, and keeps them with the question', async () => {
    const id = await create('assistant', []);
    vi.mocked(peer).mockImplementation(async (_service: string, path: string) =>
      (path.includes('/trainings/') ? { projectId: project, name: 'Night run' } : project1) as never
    );
    expect((await ask(id, 'about-with-runs-1', { projectId: project, trainingIds: [run] })).status).toBe(201);
    expect(await sentContext(id)).toMatchObject({ projectId: project, projectName: 'IseAuto', trainingLabels: [{ id: run, name: 'Night run' }] });
  });

  it('refuses runs that are not in the project, runs with no project, and a paper together with a project', async () => {
    const id = await create('assistant', []);
    vi.mocked(peer).mockImplementation(async (_service: string, path: string) =>
      (path.includes('/trainings/') ? { projectId: 'another', name: 'Elsewhere' } : project1) as never
    );
    expect((await ask(id, 'about-mismatch-01', { projectId: project, trainingIds: [run] })).status).toBe(400);
    // Runs with no project to belong to are refused where they are checked, whatever reaches it.
    await expect(verifyAbout({ user: { id: 'alice' }, headers: {} } as never, { trainingIds: [run] })).rejects.toThrow('Select a project');
    expect((await ask(id, 'about-paper-plus-1', { projectId: project, paperId: paper })).status).toBe(400);
  });

  it('names a paper the asker may read, on its own', async () => {
    const id = await create('assistant', []);
    vi.mocked(peer).mockResolvedValue({ id: paper, title: 'CLFTv2: fusion' } as never);
    expect((await ask(id, 'about-paper-0001', { paperId: paper })).status).toBe(201);
    expect(await sentContext(id)).toMatchObject({ paperId: paper, paperTitle: 'CLFTv2: fusion' });
  });
});

describe('a topic and an old bot thread', () => {
  it('forgets the questions before a new topic, once however often it is asked', async () => {
    const id = await create('assistant', []);
    const marker = await request(`/conversations/${id}/topic`, 'alice', {});
    expect(marker.status).toBe(201);
    expect(marker.body.data).toMatchObject({ kind: 'system', body: expect.stringContaining('New topic') });
    const again = await request(`/conversations/${id}/topic`, 'alice', {});
    expect(again.body.data._id).toBe(marker.body.data._id);
    expect(await Message.countDocuments({ conversationId: id, kind: 'system' })).toBe(1);
    const stored = await Conversation.findById(id);
    expect(stored?.participants[0].topicSeq).toBe(1);
    // Only a chat with an assistant has topics.
    expect((await request(`/conversations/${await create('direct', ['bob'])}/topic`, 'alice', {})).status).toBe(400);
  });

  it.each(['list', 'read'] as const)('repairs a direct chat with a bot made before bots had their own chats, on %s', async (entry) => {
    const users = mongoose.connection.collection('users');
    await mongoose.connection.collection('chatassistants').insertOne({
      name: 'Helper', createdBy: 'maker', published: true, paused: false, managerIds: [], defaultForUserIds: [], personality: '', profileUserId: 'bot-user'
    });
    const bot = await mongoose.connection.collection('chatassistants').findOne({ profileUserId: 'bot-user' });
    const legacy = await Conversation.create({
      kind: 'direct', title: 'Helper', createdBy: 'bob', directKey: 'bob:bot-user', requestSent: true, requestClientId: 'old-hello', seq: 1, lastMessageSeq: 1,
      participants: [
        { userId: 'bob', name: 'Bob', state: 'active', role: 'owner', joinedAt: new Date() },
        { userId: 'bot-user', name: 'Helper', state: 'invited', role: 'member' }
      ]
    });
    await users.deleteMany({});
    const opened = entry === 'list' ? await request('/conversations', 'bob') : await request(`/conversations/${legacy.id}/messages`, 'bob');
    expect(opened.status).toBe(200);
    const repaired = await Conversation.findById(legacy.id).select('+directKey');
    expect(repaired).toMatchObject({ kind: 'assistant', assistantId: String(bot!._id), title: 'Helper' });
    expect(repaired?.directKey).toBeUndefined();
    expect(repaired?.bindingKey).toBe(`assistant:${bot!._id}:bob`);
  });
});
