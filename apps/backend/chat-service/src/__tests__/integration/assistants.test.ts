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
