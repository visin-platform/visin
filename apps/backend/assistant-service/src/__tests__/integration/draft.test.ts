import '../helpers/mocks';
import { type Mock } from 'vitest';
import { Assistant } from '../../models/Assistant';
import { AssistantRun } from '../../models/AssistantRun';
import { Message } from '../helpers/fakeChat';
import { analyze } from '../../services/analyst';
import { startWorker } from '../../services/worker';
import { enableAnalyst } from '../helpers/analystFixtures';
import { create, request, setupAssistantTests } from '../helpers/testServer';

setupAssistantTests();

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(conversationId: string, patch: Record<string, unknown> = {}) {
  return AssistantRun.create({
    conversationId,
    messageId: '5f1d7f3b9c1e4a0012345678',
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    state: 'running',
    leaseUntil: new Date(Date.now() + 60_000),
    ...patch
  });
}


describe('cancelling', () => {
  it('is cleared by cancelling', async () => {
    const id = await create('assistant', []);
    const job = await run(id, { draft: 'Partial' });
    await request(`/conversations/${id}/cancel`, 'alice', {});
    const after = await AssistantRun.findById(job._id).lean();
    expect(after?.state).toBe('cancelled');
    expect(after?.draft).toBeUndefined();
  });
});

describe('the worker saves the draft', () => {
  it('as the analyst writes, keeps the whole answer until it is published, then lets go of it', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Summarize this', clientId: 'draft-question-1' });
    let midway: string | null | undefined;
    (analyze as Mock).mockImplementationOnce(async (input: { onText?: (text: string) => void }) => {
      input.onText?.('Validation peaked');
      await pause(500);
      midway = (await AssistantRun.findOne({ conversationId: id }).lean())?.draft;
      input.onText?.('Validation peaked at epoch 42.');
      return { text: 'Validation peaked at epoch 42.', evidence: [], inputTokens: 100, outputTokens: 20 };
    });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect(midway).toBe('Validation peaked');
    // Completed but not yet published: the whole answer is the preview.
    const finished = await AssistantRun.findOne({ conversationId: id }).lean();
    expect(finished).toMatchObject({ state: 'completed', published: false, draft: 'Validation peaked at epoch 42.' });
    await worker.tick();
    expect(await AssistantRun.findOne({ conversationId: id }).lean()).toMatchObject({ published: true });
    expect((await AssistantRun.findOne({ conversationId: id }).lean())?.draft).toBeUndefined();
  });

  it('drops the draft of a run that fails', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Summarize this', clientId: 'draft-question-2' });
    (analyze as Mock).mockImplementationOnce(async (input: { onText?: (text: string) => void }) => {
      input.onText?.('Half an answer');
      await pause(400);
      throw new Error('Provider fell over');
    });
    const worker = startWorker();
    worker();
    await worker.tick();
    const failed = await AssistantRun.findOne({ conversationId: id }).lean();
    expect(failed).toMatchObject({ state: 'failed', error: 'Provider fell over' });
    expect(failed?.draft).toBeUndefined();
  });

  it('does not stream into a conversation between people', async () => {
    await enableAnalyst('test');
    const assistant = await Assistant.create({ createdBy: 'alice', name: 'Reviewer', personality: 'Explain' });
    const id = await create('direct', ['bob']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    await request(`/conversations/${id}/assistants`, 'alice', { action: 'add', assistantId: assistant.id });
    for (const user of ['alice', 'bob']) await request(`/conversations/${id}/assistants`, user, { action: 'consent', enabled: true });
    expect(
      (await request(`/conversations/${id}/messages`, 'bob', { body: 'Explain', clientId: 'shared-draft-001', assistantId: assistant.id })).status
    ).toBe(201);
    const worker = startWorker();
    worker();
    await worker.tick();
    const input = (analyze as Mock).mock.calls.at(-1)![0];
    // It really was a shared run, and it was given no way to write a preview.
    expect(input.shared).toBe(true);
    expect(input.onText).toBeUndefined();
    expect((await AssistantRun.findOne({ conversationId: id }).lean())?.draft).toBeUndefined();
  });
});

describe('the worker records what the analyst did', () => {
  it('as steps with a start and an end, in order, and keeps them on the run', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Summarize this', clientId: 'step-question-1' });
    let midway: { tool?: string | null; endedAt?: Date | null }[] = [];
    (analyze as Mock).mockImplementationOnce(
      async (input: { step?: { start: (tool: string) => Promise<void>; end: (tool: string) => Promise<void> } }) => {
        await input.step?.start('get_project');
        await input.step?.end('get_project');
        await input.step?.start('get_training_curve');
        midway = (await AssistantRun.findOne({ conversationId: id }).lean())?.steps ?? [];
        await input.step?.end('get_training_curve');
        return { text: 'Done.', evidence: [], inputTokens: 10, outputTokens: 5 };
      }
    );
    const worker = startWorker();
    worker();
    await worker.tick();
    expect(midway.map((step) => [step.tool, Boolean(step.endedAt)])).toEqual([
      ['get_project', true],
      ['get_training_curve', false]
    ]);
    const after = await AssistantRun.findOne({ conversationId: id }).lean();
    expect(after?.steps.map((step) => [step.tool, Boolean(step.endedAt)])).toEqual([
      ['get_project', true],
      ['get_training_curve', true]
    ]);
  });

  it('keeps the words a search used with its step, and only for a search', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Anything on driving?', clientId: 'detail-question-1' });
    (analyze as Mock).mockImplementationOnce(
      async (input: { step?: { start: (tool: string, detail?: string) => Promise<void>; end: (tool: string) => Promise<void> } }) => {
        await input.step?.start('search_visin', 'autonomous vehicles, driving');
        await input.step?.end('search_visin');
        await input.step?.start('get_project');
        await input.step?.end('get_project');
        return { text: 'Done.', evidence: [], inputTokens: 10, outputTokens: 5 };
      }
    );
    const worker = startWorker();
    worker();
    await worker.tick();
    const after = await AssistantRun.findOne({ conversationId: id }).lean();
    expect(after?.steps.map((step) => [step.tool, step.detail])).toEqual([
      ['search_visin', 'autonomous vehicles, driving'],
      ['get_project', undefined]
    ]);
  });

  it('records a note the analyst wrote before reading as a thought, and publishes its thinking with the answer', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Does it overfit?', clientId: 'thought-question-1' });
    const at = new Date('2026-11-17T10:00:00Z');
    (analyze as Mock).mockImplementationOnce(
      async (input: { step?: { thought?: (text: string) => Promise<void>; start: (tool: string) => Promise<void>; end: (tool: string) => Promise<void> } }) => {
        await input.step?.thought?.('I will compare the best and last epochs.');
        await input.step?.start('get_training');
        await input.step?.end('get_training');
        return {
          text: 'It does not.',
          evidence: [],
          thoughts: [{ text: 'I will compare the best and last epochs.', at }],
          inputTokens: 10,
          outputTokens: 5
        };
      }
    );
    const worker = startWorker();
    worker();
    await worker.tick();
    await worker.tick();
    const after = await AssistantRun.findOne({ conversationId: id }).lean();
    expect(after?.steps.map((step) => [step.thought ?? step.tool, Boolean(step.endedAt)])).toEqual([
      ['I will compare the best and last epochs.', true],
      ['get_training', true]
    ]);
    const answer = await Message.findOne({ conversationId: id, kind: 'assistant' }).lean();
    expect(answer?.body).toBe('It does not.');
    expect(answer?.thoughts?.map((t) => [t.text, t.at?.toISOString()])).toEqual([
      ['I will compare the best and last epochs.', at.toISOString()]
    ]);
  });

  it('does not record them for a conversation between people', async () => {
    await enableAnalyst('test');
    const assistant = await Assistant.create({ createdBy: 'alice', name: 'Reviewer', personality: 'Explain' });
    const id = await create('direct', ['bob']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    await request(`/conversations/${id}/assistants`, 'alice', { action: 'add', assistantId: assistant.id });
    for (const user of ['alice', 'bob']) await request(`/conversations/${id}/assistants`, user, { action: 'consent', enabled: true });
    await request(`/conversations/${id}/messages`, 'bob', { body: 'Explain', clientId: 'shared-step-001', assistantId: assistant.id });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.at(-1)![0].step).toBeUndefined();
  });
});

