import '../helpers/mocks';
import { type Mock } from 'vitest';
import { Assistant } from '../../models/Assistant';
import { AssistantRun } from '../../models/AssistantRun';
import { Message } from '../../models/Message';
import { analyze } from '../../services/analyst';
import { startWorker } from '../../services/worker';
import { enableAnalyst } from '../helpers/analystFixtures';
import { request, setupChatTests } from '../helpers/testServer';

setupChatTests();

describe('reusable private assistants', () => {
  it('validates profiles and prevents other users from managing or using them', async () => {
    expect((await request('/assistants', 'alice', { name: ' ' })).status).toBe(400);
    const made = await request('/assistants', 'alice', { name: 'Reviewer', personality: 'Explain assumptions' });
    expect(made.status).toBe(201);
    const assistantId = made.body.data._id;
    expect((await request(`/assistants/${assistantId}`, 'bob', { name: 'Taken' })).status).toBe(404);
    expect((await request(`/assistants/${assistantId}/delete`, 'bob', {})).status).toBe(404);
    const hidden = await request('/assistants', 'bob');
    expect(hidden.body.data).toEqual([]);
    expect((await request('/conversations', 'bob', { kind: 'assistant', title: 'Private', assistantId })).status).toBe(
      404
    );
    expect(
      (await request('/conversations', 'alice', { kind: 'room', title: 'Shared', handles: ['bob'], assistantId }))
        .status
    ).toBe(400);
  });

  it('snapshots instructions per question, retains attribution, and reuses a profile across threads', async () => {
    await enableAnalyst();
    const made = await request('/assistants', 'alice', { name: 'Reviewer', personality: 'Explain assumptions' });
    const assistantId = made.body.data._id;
    const one = await request('/conversations', 'alice', { kind: 'assistant', title: 'One', assistantId });
    const two = await request('/conversations', 'alice', { kind: 'assistant', title: 'Two', assistantId });
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    const conversationId = String(one.body.data._id);
    expect(
      (
        await request(`/conversations/${conversationId}/messages`, 'alice', {
          body: 'Review this',
          clientId: 'assistant-review-1'
        })
      ).status
    ).toBe(201);
    await request(`/assistants/${assistantId}`, 'alice', { name: 'New name', personality: 'Use tables' });
    const worker = startWorker();
    try {
      await worker.tick();
      await worker.tick();
      expect(analyze).toHaveBeenLastCalledWith(expect.objectContaining({ personality: 'Explain assumptions' }));
      const answer = await Message.findOne({ conversationId, kind: 'assistant' });
      expect(answer?.senderName).toBe('Reviewer');
      expect(answer?.senderId).toBe(`assistant:${assistantId}`);
      await worker.tick();
      expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(1);
      await request(`/assistants/${assistantId}/delete`, 'alice', {});
      expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(1);
      expect(
        (
          await request(`/conversations/${conversationId}/messages`, 'alice', {
            body: 'Again',
            clientId: 'assistant-review-2'
          })
        ).status
      ).toBe(400);
    } finally {
      worker();
    }
  });

  it('does not execute a queued question after the assistant is paused', async () => {
    await enableAnalyst();
    const made = await request('/assistants', 'alice', { name: 'Reviewer' });
    const assistantId = made.body.data._id;
    const conversation = await request('/conversations', 'alice', { kind: 'assistant', title: 'Private', assistantId });
    const conversationId = String(conversation.body.data._id);
    await request(`/conversations/${conversationId}/messages`, 'alice', {
      body: 'Review',
      clientId: 'assistant-paused-1'
    });
    await request(`/assistants/${assistantId}`, 'alice', { name: 'Reviewer', paused: true });
    const calls = (analyze as Mock).mock.calls.length;
    const worker = startWorker();
    try {
      await worker.tick();
      await worker.tick();
      expect((analyze as Mock).mock.calls.length).toBe(calls);
      expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
      expect(await AssistantRun.countDocuments({ conversationId })).toBe(0);
    } finally {
      worker();
    }
  });
});

it('withholds an answer when its assistant is removed during generation', async () => {
  await enableAnalyst();
  const assistant = await Assistant.create({ createdBy: 'alice', name: 'Reviewer' });
  const conversation = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Private',
    assistantId: assistant.id
  });
  const conversationId = String(conversation.body.data._id);
  await request(`/conversations/${conversationId}/messages`, 'alice', {
    body: 'Review',
    clientId: 'remove-during-run'
  });
  (analyze as Mock).mockImplementationOnce(async () => {
    await request(`/assistants/${assistant.id}/delete`, 'alice', {});
    return { text: 'Must not appear', evidence: [], inputTokens: 100, outputTokens: 20 };
  });
  const worker = startWorker();
  worker();
  await worker.tick();
  await worker.tick();
  expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
  expect((await AssistantRun.findOne({ conversationId }))?.state).toBe('cancelled');
});

describe('the default analyst', () => {
  type Row = { _id: string; name: string; isDefault: boolean };
  const list = async (user = 'alice') => (await request<Row[]>('/assistants', user)).body.data;
  const analysis = async (user = 'alice', extra: object = {}) =>
    await request<{ _id: string; assistantId?: string }>('/conversations', user, {
      kind: 'assistant',
      title: 'Run',
      ...extra
    });

  it('makes the first assistant someone creates their default, and a later one only when asked', async () => {
    const vivi = (await request<Row>('/assistants', 'alice', { name: 'Vivi' })).body.data;
    expect(vivi.isDefault).toBe(true);
    const second = (await request<Row>('/assistants', 'alice', { name: 'Second' })).body.data;
    expect(second.isDefault).toBe(false);
    expect((await list()).map((row) => [row.name, row.isDefault])).toEqual([
      ['Vivi', true],
      ['Second', false]
    ]);

    const asked = (await request<Row>('/assistants', 'alice', { name: 'Third', default: true })).body.data;
    expect(asked.isDefault).toBe(true);
    expect((await list()).filter((row) => row.isDefault).map((row) => row.name)).toEqual(['Third']);
  });

  it('starts a new private analysis with it, so Vivi answers instead of the built-in analyst', async () => {
    const vivi = (await request<Row>('/assistants', 'alice', { name: 'Vivi' })).body.data;
    const chat = await analysis();
    expect(chat.status).toBe(201);
    expect(chat.body.data.assistantId).toBe(vivi._id);
    // The same through a paper, a run or any other entry point: all of them are private analyses.
    expect((await analysis('alice', { title: 'Another' })).body.data.assistantId).toBe(vivi._id);
  });

  it('lets a chat name another assistant, and leaves other people and other kinds of chat alone', async () => {
    await request('/assistants', 'alice', { name: 'Vivi' });
    const other = (await request<Row>('/assistants', 'alice', { name: 'Other' })).body.data;
    expect((await analysis('alice', { assistantId: other._id })).body.data.assistantId).toBe(other._id);
    expect((await analysis('bob')).body.data.assistantId).toBeUndefined();
    const direct = await request<{ assistantId?: string }>('/conversations', 'alice', {
      kind: 'direct',
      title: 'Hi',
      handles: ['bob']
    });
    expect(direct.body.data.assistantId).toBeUndefined();
  });

  it('is changed, and turned off, from the assistant’s own settings without touching its other settings', async () => {
    const vivi = (await request<Row>('/assistants', 'alice', { name: 'Vivi', personality: 'Concise' })).body.data;
    const other = (await request<Row>('/assistants', 'alice', { name: 'Other' })).body.data;

    await request(`/assistants/${other._id}`, 'alice', { name: 'Other', default: true });
    expect((await list()).filter((row) => row.isDefault).map((row) => row.name)).toEqual(['Other']);
    expect((await analysis()).body.data.assistantId).toBe(other._id);

    // Saving the name alone does not change who is the default.
    await request(`/assistants/${other._id}`, 'alice', { name: 'Other renamed' });
    expect((await list()).find((row) => row.isDefault)?.name).toBe('Other renamed');

    await request(`/assistants/${other._id}`, 'alice', { name: 'Other renamed', default: false });
    expect((await list()).some((row) => row.isDefault)).toBe(false);
    expect((await analysis()).body.data.assistantId).toBeUndefined();
    expect(vivi.isDefault).toBe(true);
  });

  it('falls back to the built-in analyst while the default is paused or removed, and never lists who else has it', async () => {
    const vivi = (await request<Row>('/assistants', 'alice', { name: 'Vivi' })).body.data;
    await request(`/assistants/${vivi._id}`, 'alice', { name: 'Vivi', paused: true });
    expect((await analysis()).body.data.assistantId).toBeUndefined();

    await request(`/assistants/${vivi._id}`, 'alice', { name: 'Vivi', paused: false });
    expect((await analysis()).body.data.assistantId).toBe(vivi._id);
    await request(`/assistants/${vivi._id}/delete`, 'alice', {});
    expect((await analysis()).body.data.assistantId).toBeUndefined();

    const stored = await Assistant.findById(vivi._id).select('+defaultForUserIds');
    expect(stored?.defaultForUserIds).toEqual(['alice']);
    expect(JSON.stringify((await request('/assistants', 'alice')).body.data)).not.toContain('defaultForUserIds');
  });

  it('is per person: each manager has their own default for an assistant they share', async () => {
    const made = (await request<Row>('/assistants', 'alice', { name: 'Shared' })).body.data;
    await Assistant.updateOne({ _id: made._id }, { $set: { managerIds: ['bob'] } });
    expect((await list('bob'))[0].isDefault).toBe(false);
    await request(`/assistants/${made._id}`, 'bob', { name: 'Shared', default: true });
    expect((await list('bob'))[0].isDefault).toBe(true);
    expect((await list('alice'))[0].isDefault).toBe(true);
    await request(`/assistants/${made._id}`, 'bob', { name: 'Shared', default: false });
    expect((await list('alice'))[0].isDefault).toBe(true);
  });
});

describe('the published platform default', () => {
  const platform = () =>
    Assistant.create({
      name: 'Vivi',
      createdBy: 'operator',
      published: true,
      platformDefault: true,
      personality: 'Be concise.'
    });
  it('resolves Vivi for everyone without exposing instructions or manager lists', async () => {
    const vivi = await platform();
    const selected = await request('/assistants/default', 'bob');
    expect(selected.body.data).toEqual({ _id: vivi.id, name: 'Vivi' });
    expect(
      (await request('/conversations', 'bob', { kind: 'assistant', title: 'General' })).body.data.assistantId
    ).toBe(vivi.id);
    expect((await request('/assistants', 'bob')).body.data).toEqual([]);
    expect((await request('/assistants', 'bob', { name: 'Mine', platformDefault: true })).status).toBe(400);
  });
  it('keeps Vivi when a personal assistant is created, but respects an explicit personal default', async () => {
    const vivi = await platform();
    const made = await request('/assistants', 'bob', { name: 'Custom' });
    expect(made.body.data.isDefault).toBe(false);
    expect((await request('/assistants/default', 'bob')).body.data._id).toBe(vivi.id);
    await request(`/assistants/${made.body.data._id}`, 'bob', { name: 'Custom', default: true });
    expect((await request('/assistants/default', 'bob')).body.data._id).toBe(made.body.data._id);
    expect((await request('/assistants/default', 'alice')).body.data._id).toBe(vivi.id);
  });
  it('does not use a platform assistant that is private, paused or removed', async () => {
    const vivi = await platform();
    for (const changes of [
      { published: false },
      { published: true, paused: true },
      { paused: false, deletedAt: new Date() }
    ]) {
      await Assistant.updateOne({ _id: vivi.id }, { $set: changes });
      expect((await request('/assistants/default', 'bob')).body.data).toBeNull();
    }
  });
  it('pins Vivi on a legacy private thread and queues the reply with her identity', async () => {
    await enableAnalyst('test');
    const legacy = await request('/conversations', 'bob', { kind: 'assistant', title: 'Legacy' });
    const vivi = await platform();
    const sent = await request(`/conversations/${legacy.body.data._id}/messages`, 'bob', {
      body: 'Hello',
      clientId: 'legacy-vivi-question'
    });
    expect(sent.status).toBe(201);
    const stored = await Message.findById(sent.body.data._id).select('+assistantRequest');
    expect(stored?.assistantRequest).toMatchObject({
      assistantId: vivi.id,
      assistantName: 'Vivi',
      personality: 'Be concise.'
    });
    expect((await request(`/conversations/${legacy.body.data._id}`, 'bob')).body.data.assistantId).toBe(vivi.id);
  });
});
