import '../helpers/mocks';
import mongoose from 'mongoose';
import { assistantRuns as AssistantRun } from '../helpers/assistantData';
import { screenCalls as ScreenCall } from '../helpers/assistantData';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

const TAB = 'tab-aaaa1111';
const trainingId = 'a'.repeat(24);

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

// What chat's stream sends the asker of what an assistant did to the page: from the calls and the selection it keeps.
it('sends the selection an assistant chose to the page, once it is kept with the chat', async () => {
  const id = await create('assistant', []);
  await mongoose.connection.collection('chatconversations').updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { trainingIds: [trainingId], trainingLabels: [{ id: trainingId, name: 'Verified run' }] } }
  );
  const events = await readUntil(`${base}/api/chat/conversations/${id}/events`, 'alice', 'event: selection');
  expect(events).toContain('event: selection');
  expect(events).toContain(trainingId);
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
