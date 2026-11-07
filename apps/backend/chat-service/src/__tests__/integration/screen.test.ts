import '../helpers/mocks';
import { vi, type Mock } from 'vitest';
import { steerScreen } from '../../services/screenSteering';
import { Settings } from '../../models/Settings';
import { resetAssistantSettingsCache } from '../../services/settings';
import { Conversation } from '../../models/Conversation';
import { peer } from '../../services/access';
import { AssistantRun } from '../../models/AssistantRun';
import { Message } from '../../models/Message';
import { ScreenCall } from '../../models/ScreenCall';
import { Budget } from '../../models/Budget';
import { reservationFor } from '../../services/analysisLimits';
import { analyze } from '../../services/analyst';
import { expireScreenCalls, requestScreen } from '../../services/screen';
import { startWorker } from '../../services/worker';
import { enableAnalyst, vision, restoreFetch } from '../helpers/analystFixtures';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

const TAB = 'tab-aaaa1111';
const trainingId = 'a'.repeat(24);
const run = (overrides = {}) => ({
  id: 'run1',
  conversationId: 'c1',
  userId: 'alice',
  screen: { tabId: TAB, path: '/projects', allowActions: true },
  ...overrides
});
const pending = () => ScreenCall.findOne({ state: 'pending' });

it('inserts a call, waits for the answer and returns what the page did', async () => {
  const waiting = requestScreen(
    run(),
    { place: 'training', id: trainingId, tab: 'epochs' },
    new AbortController().signal
  );
  let call = await pending();
  for (let i = 0; !call && i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    call = await pending();
  }
  expect(call).toMatchObject({
    userId: 'alice',
    tabId: TAB,
    place: 'training',
    params: { id: trainingId, tab: 'epochs' }
  });
  const answered = await request(`/screen-calls/${call!.id}/result`, 'alice', {
    ok: true,
    summary: 'Opened training, Epochs tab'
  });
  expect(answered.status).toBe(200);
  expect(await waiting).toEqual({ ok: true, text: 'Opened training, Epochs tab' });
});

it('turns a page that does not answer into words, and expires the call', async () => {
  const outcome = await requestScreen(run(), { place: 'projects' }, new AbortController().signal, 300);
  expect(outcome.ok).toBe(false);
  expect(outcome.text).toContain('did not answer');
  expect((await ScreenCall.findOne({}))?.state).toBe('expired');
});

it('refuses places and ids that are not valid before inserting anything', async () => {
  const signal = new AbortController().signal;
  for (const bad of [
    { place: 'https://evil.example.test' },
    { place: 'training', id: '../../admin' },
    { place: 'training', id: trainingId, tab: 'nope' },
    { place: 'training', id: trainingId, extra: 'x' },
    { place: 'compare', ids: [trainingId] },
    { place: 'suite', slug: 'a/b', version: '1' },
    'not an object'
  ])
    expect((await requestScreen(run(), bad, signal)).ok).toBe(false);
  expect(await ScreenCall.countDocuments()).toBe(0);
});

it('has nothing to show on when the run has no screen', async () => {
  const outcome = await requestScreen(run({ screen: undefined }), { place: 'projects' }, new AbortController().signal);
  expect(outcome.ok).toBe(false);
  expect(await ScreenCall.countDocuments()).toBe(0);
});

it('does not insert a call for a run that was already cancelled', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await expect(requestScreen(run(), { place: 'projects' }, controller.signal)).rejects.toThrow('cancelled');
  expect(await ScreenCall.countDocuments()).toBe(0);
});

it('expires the call when the run is cancelled while waiting', async () => {
  const controller = new AbortController();
  const waiting = requestScreen(run(), { place: 'projects' }, controller.signal);
  const rejected = expect(waiting).rejects.toBeDefined();
  await new Promise((resolve) => setTimeout(resolve, 100));
  controller.abort(new Error('cancelled'));
  await rejected;
  expect((await ScreenCall.findOne({}))?.state).toBe('expired');
});

it('takes one answer, only from the call’s own user, only while pending', async () => {
  const call = await ScreenCall.create({
    runId: 'r',
    conversationId: 'c',
    userId: 'alice',
    tabId: TAB,
    place: 'projects'
  });
  expect((await request(`/screen-calls/${call.id}/result`, 'bob', { ok: true })).status).toBe(404);
  expect((await request(`/screen-calls/${call.id}/result`, 'alice', { ok: true, extra: 1 })).status).toBe(400);
  expect(
    (await request(`/screen-calls/${call.id}/result`, 'alice', { ok: false, summary: 'Not on a screen' })).status
  ).toBe(200);
  expect((await request(`/screen-calls/${call.id}/result`, 'alice', { ok: true, summary: 'again' })).status).toBe(404);
  expect(await ScreenCall.findById(call.id)).toMatchObject({ state: 'failed', summary: 'Not on a screen' });
  expect((await request(`/screen-calls/not-an-id/result`, 'alice', { ok: true })).status).toBe(400);
});

it('rejects an answer that arrives after the call expired', async () => {
  const call = await ScreenCall.create({
    runId: 'r',
    conversationId: 'c',
    userId: 'alice',
    tabId: TAB,
    place: 'projects'
  });
  await ScreenCall.collection.updateOne({ _id: call._id }, { $set: { createdAt: new Date(Date.now() - 60000) } });
  await expireScreenCalls();
  expect((await request(`/screen-calls/${call.id}/result`, 'alice', { ok: true })).status).toBe(404);
});

async function readUntil(url: string, user: string, wanted: string, ms = 4000) {
  const controller = new AbortController();
  const response = await fetch(url, { headers: { 'x-test-user': user }, signal: controller.signal });
  const reader = response.body!.getReader();
  let text = '';
  const stop = setTimeout(() => controller.abort(), ms);
  try {
    while (!text.includes(wanted)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
  } catch {
    // Aborted: whatever arrived is the answer.
  } finally {
    clearTimeout(stop);
    controller.abort();
  }
  return text;
}

/** A call exists only while one of its person's runs is working; the stream looks for calls only then. */
const working = (conversationId: string) =>
  AssistantRun.create({
    conversationId,
    messageId: `working-${conversationId}`,
    userId: 'alice',
    email: 'alice@example.test',
    name: 'Alice',
    state: 'running',
    screen: { tabId: TAB, path: '/projects', allowActions: true }
  });

describe('the event stream', () => {
  it('sends a pending call to the asking user’s tab only', async () => {
    const id = await create('assistant', []);
    await working(id);
    await ScreenCall.create({
      runId: 'r',
      conversationId: id,
      userId: 'alice',
      tabId: TAB,
      place: 'dataset',
      params: { id: trainingId }
    });
    const url = (tab?: string) => `${base}/api/chat/conversations/${id}/events${tab ? `?tab=${tab}` : ''}`;
    const mine = await readUntil(url(TAB), 'alice', 'event: screen');
    expect(mine).toContain('event: screen');
    expect(mine).toContain('"place":"dataset"');
    expect(await readUntil(url('tab-bbbb2222'), 'alice', 'event: screen', 1500)).not.toContain('event: screen');
    expect(await readUntil(url(), 'alice', 'event: screen', 1500)).not.toContain('event: screen');
  });

  it('looks for no calls while none of the person’s runs is working', async () => {
    const id = await create('assistant', []);
    await ScreenCall.create({ runId: 'r', conversationId: id, userId: 'alice', tabId: TAB, place: 'projects' });
    const stream = await readUntil(
      `${base}/api/chat/conversations/${id}/events?tab=${TAB}`,
      'alice',
      'event: screen',
      1500
    );
    expect(stream).toContain('event: state');
    expect(stream).not.toContain('event: screen');
  });

  it('keeps the page’s frame list out of the runs it sends', async () => {
    const id = await create('assistant', []);
    await AssistantRun.create({
      conversationId: id,
      messageId: 'frames-1',
      userId: 'alice',
      email: 'alice@example.test',
      name: 'Alice',
      state: 'completed',
      screen: {
        tabId: TAB,
        path: '/trainings',
        allowActions: true,
        actions: [{ name: 'open_frame', ids: [trainingId] }]
      }
    });
    const runs = (await request<Record<string, unknown>[]>(`/conversations/${id}/runs`)).body.data;
    expect(runs).toHaveLength(1);
    expect(runs[0]).not.toHaveProperty('screen');
  });

  it('refuses a malformed tab id', async () => {
    const id = await create('assistant', []);
    const response = await fetch(`${base}/api/chat/conversations/${id}/events?tab=../x`, {
      headers: { 'x-test-user': 'alice' }
    });
    expect(response.status).toBe(400);
  });
});

describe('sending a message with a screen', () => {
  it('answers without page changes rather than refusing when the day cannot hold room for them', async () => {
    await enableAnalyst('test');
    const day = new Date().toISOString().slice(0, 10);
    // 800k a day, and an answer in progress elsewhere holds enough that a page-changing turn no longer fits.
    const held = 800_000 - reservationFor(true, 8) + 1;
    await Budget.create({ userId: 'alice', day, reserved: held });
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', {
      body: 'Open my runs',
      clientId: 'screen-budget-01',
      screen: { tabId: TAB, path: '/projects', allowActions: true }
    });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((await AssistantRun.findOne({ conversationId: id }))?.state).toBe('completed');
    const input = (analyze as Mock).mock.calls.at(-1)![0];
    expect(input.screen).toBeUndefined();
    expect(input.screenContext).toMatchObject({ path: '/projects' });
    expect((await Budget.findOne({ userId: 'alice', day }))?.reserved).toBe(held + 120);
  });

  it('passes the tab to the analyst without storing it on the message', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    const sent = await request(`/conversations/${id}/messages`, 'alice', {
      body: 'Open my runs',
      clientId: 'screen-msg-001',
      screen: {
        tabId: TAB,
        path: '/projects',
        allowActions: true,
        actions: [{ name: 'open_frame', ids: [trainingId], labels: ['Loaded frame'] }]
      }
    });
    expect(sent.status).toBe(201);
    expect(JSON.stringify(sent.body.data)).not.toContain(TAB);
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((await AssistantRun.findOne({ conversationId: id }))?.screen).toMatchObject({
      tabId: TAB,
      path: '/projects'
    });
    const input = (analyze as Mock).mock.calls.at(-1)![0];
    expect(typeof input.screen).toBe('function');
    expect(input.screenContext).toMatchObject({
      path: '/projects',
      actions: [{ name: 'open_frame', ids: [trainingId], labels: ['Loaded frame'] }]
    });
    expect(await Message.countDocuments({ conversationId: id, body: /TAB/ })).toBe(0);
  });

  it('keeps screen requests out of legacy queue scans and exposes queued status to clients', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    const sent = await request(`/conversations/${id}/messages`, 'alice', {
      body: 'Open project',
      clientId: 'screen-queue-001',
      screen: { tabId: TAB, path: '/projects', allowActions: true }
    });
    expect(sent.status).toBe(201);
    expect(await Message.countDocuments({ assistantRequest: { $exists: true } })).toBe(0);
    const message = await Message.findOne({ conversationId: id }).select('+screenRequest');
    expect(message?.screenRequest?.screen?.allowActions).toBe(true);
    expect(JSON.stringify((await request(`/conversations/${id}/messages`)).body)).not.toContain(TAB);
    // Pause execution after outbox recovery to inspect the durable claim boundary.
    await Settings.updateOne({ _id: 'assistant' }, { $set: { enabled: false } });
    resetAssistantSettingsCache();
    const worker = startWorker();
    worker();
    await worker.tick();
    expect(await AssistantRun.countDocuments({ state: 'queued' })).toBe(0);
    expect((await AssistantRun.findOne({ conversationId: id }))?.state).toBe('screen_queued');
    const runs = await request<{ state: string; canCancel: boolean }[]>(`/conversations/${id}/runs`);
    expect(runs.body.data[0]).toMatchObject({ state: 'queued', canCancel: true });
    await request(`/conversations/${id}/cancel`, 'alice', {});
    expect((await AssistantRun.findOne({ conversationId: id }))?.state).toBe('cancelled');
  });

  it('cancels a screen request before queue recovery', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', {
      body: 'Open project',
      clientId: 'screen-cancel-001',
      screen: { tabId: TAB, path: '/projects', allowActions: true }
    });
    await request(`/conversations/${id}/cancel`, 'alice', {});
    const message = await Message.findOne({ conversationId: id }).select('+screenRequest +assistantCancelled');
    expect(message?.screenRequest).toBeUndefined();
    expect(message?.assistantCancelled).toBe(true);
    const worker = startWorker();
    worker();
    await worker.tick();
    expect(await AssistantRun.countDocuments({ conversationId: id })).toBe(0);
  });

  it('sends none to the analyst when the message carried none', async () => {
    await enableAnalyst('test');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'screen-msg-002' });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.at(-1)![0].screen).toBeUndefined();
  });

  it('refuses a screen that is not a tab and a path', async () => {
    const id = await create('assistant', []);
    for (const screen of [
      { tabId: 'x', path: '/p' },
      { tabId: TAB, path: 'https://evil.example.test' },
      { tabId: TAB, path: '/p', more: 1 }
    ])
      expect(
        (await request(`/conversations/${id}/messages`, 'alice', { body: 'Hi', clientId: 'screen-bad-001', screen }))
          .status
      ).toBe(400);
  });

  it('never gives the screen to a shared conversation', async () => {
    const id = await create('direct', ['bob']);
    const sent = await request(`/conversations/${id}/messages`, 'alice', {
      body: 'Hi',
      clientId: 'screen-msg-003',
      screen: { tabId: TAB, path: '/projects', allowActions: true }
    });
    expect(sent.status).toBe(201);
    const stored = await Message.findOne({ conversationId: id }).select('+assistantRequest');
    expect(stored?.assistantRequest).toBeUndefined();
  });
});

it('persists a verified comparison selection only after the asking page confirms it', async () => {
  const id = await create('assistant', []);
  const projectId = 'p1';
  await Conversation.updateOne({ _id: id }, { $set: { projectId, workerRunId: 'r1' } });
  vi.mocked(peer).mockResolvedValue({ projectId, name: 'Verified run' });
  const ids = [trainingId, 'b'.repeat(24)];
  const waiting = steerScreen(
    { id: 'r1', conversationId: id, userId: 'alice', screen: { tabId: TAB, path: '/projects', allowActions: true } },
    projectId,
    'scoped-key',
    { place: 'compare', ids },
    new AbortController().signal,
    async () => {}
  );
  let call = await pending();
  for (let i = 0; !call && i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    call = await pending();
  }
  expect((await Conversation.findById(id))?.trainingIds).toEqual([]);
  expect(peer).toHaveBeenCalledWith(
    'VISION',
    `/api/trainings/${trainingId}`,
    expect.objectContaining({ headers: { authorization: 'Bearer scoped-key' } })
  );
  await request(`/screen-calls/${call!.id}/result`, 'alice', { ok: true, summary: 'Compared' });
  expect((await waiting).ok).toBe(true);
  expect((await Conversation.findById(id))?.trainingIds).toEqual(ids);
  expect((await Conversation.findById(id))?.trainingLabels.map((label) => label.name)).toEqual([
    'Verified run',
    'Verified run'
  ]);
  vision(() => new Response('{}'));
  const events = await readUntil(`${base}/api/chat/conversations/${id}/events`, 'alice', 'event: selection');
  await restoreFetch();
  expect(events).toContain('event: selection');
  expect(events).toContain(trainingId);
});

it('refuses cross-project or inaccessible comparison runs before creating a screen call', async () => {
  const input = { place: 'compare', ids: [trainingId, 'b'.repeat(24)] };
  const args = [run(), 'p1', 'scoped-key', input, new AbortController().signal, async () => {}] as const;
  vi.mocked(peer).mockResolvedValue({ projectId: 'another-project' });
  expect((await steerScreen(...args)).ok).toBe(false);
  vi.mocked(peer).mockRejectedValueOnce(new Error('unavailable'));
  expect((await steerScreen(...args)).ok).toBe(false);
  expect(await ScreenCall.countDocuments()).toBe(0);
  expect((await steerScreen(run(), undefined, '', input, new AbortController().signal, async () => {})).ok).toBe(false);
  expect(
    (
      await steerScreen(
        run(),
        'p1',
        'token',
        { place: 'compare', ids: [trainingId, trainingId] },
        new AbortController().signal,
        async () => {}
      )
    ).ok
  ).toBe(false);
});

it('does not change the thread selection when the page refuses a comparison', async () => {
  vi.mocked(peer).mockResolvedValue({ projectId: 'p1', name: 'Run' });
  const waiting = steerScreen(
    run(),
    'p1',
    'token',
    { place: 'compare', ids: [trainingId, 'b'.repeat(24)] },
    new AbortController().signal,
    async () => {}
  );
  let call = await pending();
  for (let i = 0; !call && i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    call = await pending();
  }
  await request(`/screen-calls/${call!.id}/result`, 'alice', { ok: false, summary: 'Panel closed' });
  expect(await waiting).toEqual({ ok: false, text: 'Panel closed' });
});

it('does not insert a screen call without explicit per-message permission', async () => {
  const outcome = await requestScreen(
    run({ screen: { tabId: TAB, path: '/projects' } }),
    { place: 'projects' },
    new AbortController().signal
  );
  expect(outcome.ok).toBe(false);
  expect(await ScreenCall.countDocuments()).toBe(0);
});

it('polls pending screen calls only for the authorized conversation, user and tab', async () => {
  const id = await create('assistant', []);
  const call = await ScreenCall.create({
    runId: 'r1',
    conversationId: id,
    userId: 'alice',
    tabId: TAB,
    place: 'projects'
  });
  const mine = await request(`/conversations/${id}/screen-calls?tab=${TAB}`, 'alice');
  expect(mine.status).toBe(200);
  expect(mine.body.data).toEqual([{ id: call.id, place: 'projects', params: {} }]);
  expect((await request(`/conversations/${id}/screen-calls?tab=another-tab-1111`, 'alice')).body.data).toEqual([]);
  expect((await request(`/conversations/${id}/screen-calls?tab=${TAB}`, 'bob')).status).toBe(404);
  expect((await request(`/conversations/${id}/screen-calls?tab=bad`, 'alice')).status).toBe(400);
  await request(`/screen-calls/${call.id}/result`, 'alice', { ok: true, summary: 'Opened projects' });
  expect((await request(`/conversations/${id}/screen-calls?tab=${TAB}`, 'alice')).body.data).toEqual([]);
});
it('serializes bare destinations with params even when MongoDB minimized the empty object', async () => {
  const id = await create('assistant', []);
  const call = await ScreenCall.create({
    runId: 'r1',
    conversationId: id,
    userId: 'alice',
    tabId: TAB,
    place: 'projects',
    params: {}
  });
  await ScreenCall.collection.updateOne({ _id: call._id }, { $unset: { params: 1 } });
  await working(id);
  const stream = await readUntil(`${base}/api/chat/conversations/${id}/events?tab=${TAB}`, 'alice', 'event: screen');
  expect(stream).toContain('"place":"projects","params":{}');
});
