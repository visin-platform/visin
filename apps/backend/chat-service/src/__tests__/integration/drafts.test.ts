import '../helpers/mocks';
import { assistantRuns as AssistantRun } from '../helpers/assistantData';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads an event stream as text, so a test can wait for what it expects to see. */
async function open(path: string, user = 'alice') {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/chat${path}`, { headers: { 'x-test-user': user }, signal: controller.signal });
  const reader = response.body!.getReader();
  let text = '';
  const until = async (needle: string | RegExp, ms = 6000) => {
    const deadline = Date.now() + ms;
    const found = () => (typeof needle === 'string' ? text.includes(needle) : needle.test(text));
    while (!found() && Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), pause(400).then(() => null)]);
      if (chunk && !chunk.done) text += new TextDecoder().decode(chunk.value);
    }
    return text;
  };
  return { until, text: () => text, close: () => controller.abort() };
}

const drafts = (text: string) =>
  [...text.matchAll(/event: draft\ndata: (.*)\n/g)].map((match) => JSON.parse(match[1]) as { runId: string; messageId: string; text: string });

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

// What a reader of a conversation is sent of an answer as it is written: chat decides it, from the run the assistant keeps.
describe('answers as they are written', () => {
  it('sends the draft as it grows, and only when it changes', async () => {
    const id = await create('assistant', []);
    const job = await run(id, { draft: 'Validation' });
    const stream = await open(`/conversations/${id}/events`);
    await stream.until('"text":"Validation"');
    await AssistantRun.updateOne({ _id: job._id }, { draft: 'Validation peaked at epoch 42.' });
    await stream.until('epoch 42.');
    await pause(900);
    const seen = drafts(stream.text());
    expect(seen.map((d) => d.text)).toEqual(['Validation', 'Validation peaked at epoch 42.']);
    expect(seen[0]).toMatchObject({ runId: String(job._id), messageId: '5f1d7f3b9c1e4a0012345678' });
    stream.close();
  });

  it('keeps the draft through completion, until the answer is published, then clears it', async () => {
    const id = await create('assistant', []);
    const job = await run(id, { draft: 'The answer' });
    const stream = await open(`/conversations/${id}/events`);
    await stream.until('"text":"The answer"');
    await AssistantRun.updateOne({ _id: job._id }, { state: 'completed', published: false, result: 'The answer', finishedAt: new Date() });
    await pause(1200);
    expect(drafts(stream.text()).map((d) => d.text)).toEqual(['The answer']);
    await AssistantRun.updateOne({ _id: job._id }, { published: true, $unset: { draft: 1 } });
    await stream.until('"text":""');
    expect(drafts(stream.text()).map((d) => d.text)).toEqual(['The answer', '']);
    stream.close();
  });

  it('clears the draft of a run that fails or is cancelled', async () => {
    const id = await create('assistant', []);
    const job = await run(id, { draft: 'Half an answer' });
    const stream = await open(`/conversations/${id}/events`);
    await stream.until('Half an answer');
    await AssistantRun.updateOne({ _id: job._id }, { state: 'failed', error: 'x', $unset: { draft: 1 } });
    await stream.until('"text":""');
    expect(drafts(stream.text()).map((d) => d.text)).toEqual(['Half an answer', '']);
    stream.close();
  });

  it('shows it to the asker alone, and never in a conversation between people', async () => {
    const id = await create('assistant', []);
    await run(id, { draft: 'Private reading' });
    const other = await open(`/conversations/${id}/events`, 'alice');
    await other.until('Private reading');
    other.close();
    const room = await create('room', ['bob']);
    await request(`/conversations/${room}/membership`, 'bob', { action: 'accept' });
    await run(room, { messageId: '5f1d7f3b9c1e4a0012345679', draft: 'Shared bot text' });
    const shared = await open(`/conversations/${room}/events`, 'bob');
    await shared.until('event: state');
    await pause(900);
    expect(shared.text()).not.toContain('Shared bot text');
    expect(shared.text()).not.toContain('event: draft');
    shared.close();
  });

  it('never puts the draft in the run list that polling and the state frames use', async () => {
    const id = await create('assistant', []);
    await run(id, { draft: 'Should not travel in runs' });
    const runs = await request<Record<string, unknown>[]>(`/conversations/${id}/runs`);
    expect(JSON.stringify(runs.body)).not.toContain('Should not travel');
    const stream = await open(`/conversations/${id}/events`);
    const text = await stream.until('event: state');
    expect(text.split('event: draft')[0]).not.toContain('Should not travel');
    stream.close();
  });

  it('polls quickly while an answer is on its way', async () => {
    const id = await create('assistant', []);
    const job = await run(id, { draft: 'a' });
    const stream = await open(`/conversations/${id}/events`);
    await stream.until('"text":"a"');
    const started = Date.now();
    await AssistantRun.updateOne({ _id: job._id }, { draft: 'ab' });
    await stream.until('"text":"ab"');
    expect(Date.now() - started).toBeLessThan(1200);
    stream.close();
  });
});

describe('the runs a reader is shown', () => {
  it('shows them to the asker in the run list, but not in a conversation between people', async () => {
    const id = await create('assistant', []);
    await AssistantRun.create({
      conversationId: id,
      messageId: 'q',
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      state: 'running',
      leaseUntil: new Date(Date.now() + 60_000),
      steps: [{ tool: 'get_project', startedAt: new Date() }]
    });
    const runs = await request<{ steps: { tool: string }[] }[]>(`/conversations/${id}/runs`);
    expect(runs.body.data[0].steps).toEqual([expect.objectContaining({ tool: 'get_project' })]);
  });
});
