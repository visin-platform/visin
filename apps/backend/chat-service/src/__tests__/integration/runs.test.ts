import '../helpers/mocks';
import { assistantRuns as AssistantRun } from '../helpers/assistantData';
import { appendMessage } from '../../services/messages';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();
const job = (conversationId: string, messageId: string) =>
  AssistantRun.create({
    conversationId,
    messageId,
    userId: 'alice',
    email: 'private@example.invalid',
    name: 'Alice',
    state: 'running',
    assistantName: 'Reviewer',
    activity: 'Preparing an answer',
    keyId: 'private-key-id',
    personality: 'Private configuration',
    result: 'Unpublished result',
    evidence: [{ tool: 'private_tool', input: { private: 'secret' } }]
  });
const question = (conversationId: string, clientId: string) =>
  appendMessage({
    conversationId,
    senderId: 'alice',
    senderName: 'Alice',
    kind: 'person',
    body: 'Question',
    clientId
  });

it('shows shared progress while keeping results, credentials and configuration private', async () => {
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const trigger = await question(id, 'visible-job-001');
  const run = await job(id, trigger.id);
  const reader = await request<Record<string, unknown>[]>(`/conversations/${id}/runs`, 'bob');
  expect(reader.status).toBe(200);
  expect(reader.body.data).toEqual([
    expect.objectContaining({ _id: run.id, activity: 'Preparing an answer', canCancel: false, canRetry: false })
  ]);
  for (const field of ['email', 'keyId', 'personality', 'result', 'evidence', 'inputTokens', 'price'])
    expect(reader.body.data[0]).not.toHaveProperty(field);
  const owner = await request<Record<string, unknown>[]>(`/conversations/${id}/runs`, 'alice');
  expect(owner.body.data[0].canCancel).toBe(true);
});

it('does not reveal requester errors or retry authority to other readers', async () => {
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const trigger = await question(id, 'failed-job-001');
  const run = await job(id, trigger.id);
  await AssistantRun.updateOne({ _id: run.id }, { $set: { state: 'failed', error: 'Requester-specific diagnostics' } });
  const reader = await request<Record<string, unknown>[]>(`/conversations/${id}/runs`, 'bob');
  expect(reader.body.data[0]).toMatchObject({ canRetry: false, error: 'The assistant could not complete this reply.' });
  const owner = await request<Record<string, unknown>[]>(`/conversations/${id}/runs`, 'alice');
  expect(owner.body.data[0]).toMatchObject({ canRetry: true, error: 'Requester-specific diagnostics' });
  expect((await request(`/conversations/${id}/runs`, 'mallory')).status).toBe(404);
});

it('hides jobs whose question is outside an invitee or new member history boundary', async () => {
  const id = await create('room');
  const old = await question(id, 'pre-join-job-001');
  await job(id, old.id);
  expect((await request(`/conversations/${id}/runs`, 'bob')).body.data).toEqual([]);
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  expect((await request(`/conversations/${id}/runs`, 'bob')).body.data).toEqual([]);
  const recent = await question(id, 'post-join-job-001');
  const run = await job(id, recent.id);
  const reader = await request<Record<string, unknown>[]>(`/conversations/${id}/runs`, 'bob');
  expect(reader.body.data.map((item) => item._id)).toEqual([run.id]);
});

it('keeps private jobs private and omits shared jobs with missing or invalid triggers', async () => {
  const privateId = await create('assistant', []);
  const trigger = await question(privateId, 'private-job-001');
  await job(privateId, trigger.id);
  expect((await request(`/conversations/${privateId}/runs`, 'bob')).status).toBe(404);
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const missing = await question(privateId, 'other-private-job');
  await job(id, missing.id);
  await job(id, 'legacy-invalid-id');
  expect((await request(`/conversations/${id}/runs`, 'bob')).body.data).toEqual([]);
});

it('sends the same redacted shared progress over SSE', async () => {
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const trigger = await question(id, 'shared-stream-job');
  const run = await job(id, trigger.id);
  const controller = new AbortController();
  try {
    const response = await fetch(`${base}/api/chat/conversations/${id}/events`, {
      headers: { 'x-test-user': 'bob' },
      signal: controller.signal
    });
    const reader = response.body!.getReader();
    const chunk = new TextDecoder().decode((await reader.read()).value);
    expect(chunk).toContain(run.id);
    expect(chunk).toContain('Preparing an answer');
    expect(chunk).toContain('"canCancel":false');
    expect(chunk).not.toContain('Private configuration');
    expect(chunk).not.toContain('Unpublished result');
    expect(chunk).not.toContain('private-key-id');
    expect(chunk).not.toContain('private@example.invalid');
  } finally {
    controller.abort();
  }
});

it('shows a run that waits on the page as queued, and one the asker can cancel', async () => {
  const id = await create('assistant', []);
  const trigger = await question(id, 'screen-queued-001');
  await AssistantRun.create({
    conversationId: id,
    messageId: trigger.id,
    userId: 'alice',
    email: 'alice@example.test',
    name: 'Alice',
    state: 'screen_queued',
    screen: { tabId: 'tab-aaaa1111', path: '/projects', allowActions: true }
  });
  const runs = (await request<Record<string, unknown>[]>(`/conversations/${id}/runs`)).body.data;
  expect(runs[0]).toMatchObject({ state: 'queued', canCancel: true });
  // The page's context is the worker's business, and too large for every poll.
  expect(runs[0]).not.toHaveProperty('screen');
});

it('never shows how a provider failed or which replay handler ran', async () => {
  const id = await create('assistant', []);
  const trigger = await question(id, 'failed-provider-001');
  await AssistantRun.create({
    conversationId: id,
    messageId: trigger.id,
    userId: 'alice',
    email: 'alice@example.test',
    name: 'Alice',
    state: 'failed',
    providerFailure: { status: 400, type: 'invalid_request_error', reason: 'empty_text', requestId: 'req_test' },
    providerReplayVersion: 'replay-1'
  });
  const shown = JSON.stringify((await request(`/conversations/${id}/runs`)).body.data);
  expect(shown).not.toContain('providerFailure');
  expect(shown).not.toContain('providerReplayVersion');
  expect(shown).not.toContain('req_test');
});

it("shows steps an assistant took to the asker, with the words a search used", async () => {
  const id = await create('assistant', []);
  const trigger = await question(id, 'steps-001');
  await AssistantRun.create({
    conversationId: id,
    messageId: trigger.id,
    userId: 'alice',
    email: 'alice@example.test',
    name: 'Alice',
    state: 'running',
    steps: [{ tool: 'search_visin', detail: 'autonomous vehicles', startedAt: new Date() }]
  });
  const runs = await request<{ steps: { tool: string; detail?: string }[] }[]>(`/conversations/${id}/runs`);
  expect(runs.body.data[0].steps[0]).toMatchObject({ tool: 'search_visin', detail: 'autonomous vehicles' });
});
