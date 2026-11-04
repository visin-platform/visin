import '../helpers/mocks';
import { fetchWithTimeout } from '@visin/backend-core';
import mongoose from 'mongoose';
import { type Mock } from 'vitest';
import { Assistant } from '../../models/Assistant';
import { AssistantRun } from '../../models/AssistantRun';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { groups } from '../../services/access';
import { analyze } from '../../services/analyst';
import { appendMessage } from '../../services/messages';
import { startWorker } from '../../services/worker';
import { enableAnalyst } from '../helpers/analystFixtures';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

describe('shared assistants', () => {
  async function setup(kind = 'direct') {
    await enableAnalyst();
    const assistant = await Assistant.create({
      createdBy: 'alice',
      name: 'Reviewer',
      personality: 'Explain assumptions'
    });
    const conversationId = await create(kind, ['bob']);
    await request(`/conversations/${conversationId}/membership`, 'bob', { action: 'accept' });
    expect(
      (
        await request(`/conversations/${conversationId}/assistants`, 'alice', {
          action: 'add',
          assistantId: assistant.id
        })
      ).status
    ).toBe(200);
    return { assistant, conversationId };
  }
  const consent = (conversationId: string, user: string, enabled = true) =>
    request(`/conversations/${conversationId}/assistants`, user, { action: 'consent', enabled });
  const ask = (conversationId: string, assistantId: string, user = 'bob') =>
    request(`/conversations/${conversationId}/messages`, user, {
      body: 'Explain the discussion',
      clientId: `shared-question-001-${user}`,
      assistantId
    });

  it('requires agreement from both people and leaves ordinary messages human-only', async () => {
    const { assistant, conversationId } = await setup();
    expect((await ask(conversationId, assistant.id)).status).toBe(403);
    await consent(conversationId, 'alice');
    expect((await ask(conversationId, assistant.id)).status).toBe(403);
    await consent(conversationId, 'bob');
    expect((await ask(conversationId, assistant.id)).status).toBe(201);
    const ordinary = await request(`/conversations/${conversationId}/messages`, 'alice', {
      body: 'For the people',
      clientId: 'ordinary-shared-001'
    });
    expect(
      (await Message.findById(ordinary.body.data._id).select('+assistantRequest'))?.assistantRequest
    ).toBeUndefined();
    const worker = startWorker();
    worker();
    await worker.tick();
    await worker.tick();
    expect(analyze).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId: undefined,
        trainingIds: [],
        token: '',
        shared: true,
        personality: 'Explain assumptions'
      })
    );
    expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(1);
    expect((await AssistantRun.findOne({ conversationId }))?.userId).toBe('bob');
    const answer = await Message.findOne({ conversationId, kind: 'assistant' });
    const followUp = await request(`/conversations/${conversationId}/messages`, 'alice', {
      body: 'Explain more',
      clientId: 'reply-to-assistant-001',
      replyTo: answer!.id
    });
    expect(followUp.status).toBe(201);
    expect(
      (await Message.findById(followUp.body.data._id).select('+assistantRequest'))?.assistantRequest?.assistantId
    ).toBe(assistant.id);
    await worker.tick();
    const context = JSON.parse((analyze as Mock).mock.calls.at(-1)![0].history[0].content);
    expect(context).toMatchObject({ question: 'Explain more', quote: { body: answer!.body, senderName: 'Reviewer' } });
  });

  it('denies outsiders and refuses unregistered or paused assistants', async () => {
    const { assistant, conversationId } = await setup();
    expect((await request(`/conversations/${conversationId}/assistants`, 'mallory')).status).toBe(404);
    expect((await consent(conversationId, 'mallory')).status).toBe(404);
    const another = await Assistant.create({ createdBy: 'bob', name: 'Other' });
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    expect((await ask(conversationId, another.id)).status).toBe(404);
    await Assistant.updateOne({ _id: assistant.id }, { $set: { paused: true } });
    expect((await ask(conversationId, assistant.id)).status).toBe(404);
  });

  it('withholds queued and unpublished answers after consent withdrawal', async () => {
    const { assistant, conversationId } = await setup();
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    await ask(conversationId, assistant.id);
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((await AssistantRun.findOne({ conversationId }))?.state).toBe('completed');
    await consent(conversationId, 'alice', false);
    await worker.tick();
    expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
  });

  it('cancels generation when agreement changes and never grants research tools', async () => {
    const { assistant, conversationId } = await setup();
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    await ask(conversationId, assistant.id);
    (analyze as Mock).mockImplementationOnce(async (input: { guard: () => Promise<void> }) => {
      await consent(conversationId, 'alice', false);
      await input.guard();
      throw new Error('Guard should have rejected');
    });
    const worker = startWorker();
    worker();
    await worker.tick();
    await worker.tick();
    expect((await AssistantRun.findOne({ conversationId }))?.state).toBe('failed');
    expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
  });

  it('shares a disclosed snapshot, invalidates agreement when assistants change, and serializes workers', async () => {
    const { assistant, conversationId } = await setup();
    await Assistant.updateOne({ _id: assistant.id }, { $set: { personality: 'New private instructions' } });
    const view = await request(`/conversations/${conversationId}/assistants`, 'bob');
    expect(view.body.data.bots).toEqual([expect.objectContaining({ personality: 'Explain assumptions' })]);
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    await ask(conversationId, assistant.id);
    const first = startWorker(),
      second = startWorker();
    first();
    second();
    const calls = (analyze as Mock).mock.calls.length;
    await Promise.all([first.tick(), second.tick()]);
    await Promise.all([first.tick(), second.tick()]);
    expect((analyze as Mock).mock.calls.length - calls).toBe(1);
    expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(1);
    await request(`/conversations/${conversationId}/assistants`, 'alice', {
      action: 'remove',
      assistantId: assistant.id
    });
    expect((await ask(conversationId, assistant.id, 'alice')).status).toBe(404);
    await request(`/conversations/${conversationId}/assistants`, 'alice', { action: 'add', assistantId: assistant.id });
    expect((await request(`/conversations/${conversationId}/assistants`, 'alice')).body.data.enabled).toBe(false);
  });

  it('requires fresh room agreement after a new person accepts and excludes pre-join history', async () => {
    const { assistant, conversationId } = await setup('room');
    await request(`/conversations/${conversationId}/messages`, 'alice', {
      body: 'Before the new person joined',
      clientId: 'old-room-history'
    });
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    expect(
      (
        await request(`/conversations/${conversationId}/assistants`, 'bob', {
          action: 'remove',
          assistantId: assistant.id
        })
      ).status
    ).toBe(403);
    await request(`/conversations/${conversationId}/participants`, 'alice', { handle: 'charlie' });
    expect((await ask(conversationId, assistant.id)).status).toBe(403);
    await request(`/conversations/${conversationId}/membership`, 'charlie', { action: 'accept' });
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    await consent(conversationId, 'charlie');
    await ask(conversationId, assistant.id);
    const worker = startWorker();
    worker();
    await worker.tick();
    await worker.tick();
    const input = (analyze as Mock).mock.calls.at(-1)![0];
    expect(JSON.stringify(input.history)).not.toContain('Before the new person joined');
    expect(JSON.stringify(input.history)).toContain('Explain the discussion');
  });

  it('lets room administrators lock assistants off and requires new agreement after unlocking', async () => {
    const { assistant, conversationId } = await setup('room');
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    expect(
      (await request(`/conversations/${conversationId}/assistants`, 'bob', { action: 'lock', enabled: true })).status
    ).toBe(403);
    expect(
      (await request(`/conversations/${conversationId}/assistants`, 'alice', { action: 'lock', enabled: true })).status
    ).toBe(200);
    expect((await ask(conversationId, assistant.id)).status).toBe(403);
    await request(`/conversations/${conversationId}/assistants`, 'alice', { action: 'lock', enabled: false });
    expect((await ask(conversationId, assistant.id)).status).toBe(403);
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    expect((await ask(conversationId, assistant.id)).status).toBe(201);
  });

  it('does not revive an outbox question when an assistant is paused and immediately resumed', async () => {
    const { assistant, conversationId } = await setup();
    await consent(conversationId, 'alice');
    await consent(conversationId, 'bob');
    await ask(conversationId, assistant.id);
    await request(`/assistants/${assistant.id}`, 'alice', { name: assistant.name, paused: true });
    await request(`/assistants/${assistant.id}`, 'alice', { name: assistant.name, paused: false });
    const worker = startWorker();
    worker();
    await worker.tick();
    await worker.tick();
    expect(await AssistantRun.countDocuments({ conversationId })).toBe(0);
    expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
  });

  it('does not publish through an obsolete conversation version', async () => {
    const { conversationId } = await setup();
    const original = await Conversation.findById(conversationId);
    await consent(conversationId, 'alice');
    await expect(
      appendMessage({
        conversationId,
        expectedMembershipVersion: original!.membershipVersion,
        senderId: 'assistant:analyst',
        senderName: 'Analyst',
        kind: 'assistant',
        body: 'Stale result',
        clientId: 'obsolete-version-001'
      })
    ).rejects.toThrow('Conversation changed');
    expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
  });

  it('uses live group roles and membership, with no project credentials in shared project discussions', async () => {
    await enableAnalyst();
    const assistant = await Assistant.create({ createdBy: 'alice', name: 'Reviewer' });
    const groupId = new mongoose.Types.ObjectId().toString();
    const projectId = new mongoose.Types.ObjectId().toString();
    (groups.checkMembership as Mock).mockImplementation(async (_group, user) => ({
      member: true,
      role: user === 'alice' ? 'admin' : 'member'
    }));
    const original = (await import('../../services/access.js')).peer as Mock;
    const fetchImplementation = (fetchWithTimeout as Mock).getMockImplementation();
    (fetchWithTimeout as Mock).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ data: { _id: projectId, name: 'Project', owner: { kind: 'group', id: groupId } } })
        )
    );
    original.mockResolvedValueOnce({ _id: projectId, name: 'Project', owner: { kind: 'group', id: groupId } });
    const c = await Conversation.create({
      kind: 'project',
      title: 'Project',
      createdBy: 'alice',
      groupId,
      projectId,
      participants: []
    });
    expect(
      (await request(`/conversations/${c.id}/assistants`, 'alice', { action: 'add', assistantId: assistant.id })).status
    ).toBe(200);
    original.mockResolvedValue({ _id: projectId, name: 'Project', owner: { kind: 'group', id: groupId } });
    expect(
      (await request(`/conversations/${c.id}/assistants`, 'bob', { action: 'switch', enabled: true })).status
    ).toBe(403);
    await request(`/conversations/${c.id}/assistants`, 'alice', { action: 'switch', enabled: true });
    expect((await ask(c.id, assistant.id)).status).toBe(201);
    const worker = startWorker();
    worker();
    await worker.tick();
    expect(analyze).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: undefined, token: '', shared: true })
    );
    (groups.checkMembership as Mock).mockResolvedValue({ member: false, role: null });
    await worker.tick();
    expect(await Message.countDocuments({ conversationId: c.id, kind: 'assistant' })).toBe(0);
    (fetchWithTimeout as Mock).mockImplementation(fetchImplementation!);
    original.mockResolvedValue({ _id: '111111111111111111111111', owner: { kind: 'user', id: 'alice' } });
  });
});
