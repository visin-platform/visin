import '../helpers/mocks';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

it('replays durable message sequences over SSE without exposing the outbox', async () => {
  const id = await create();
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Persistent event', clientId: 'event-001' });
  const controller = new AbortController();
  const response = await fetch(`${base}/api/chat/conversations/${id}/events`, {
    headers: { 'x-test-user': 'alice' },
    signal: controller.signal
  });
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader = response.body!.getReader();
  const chunk = new TextDecoder().decode((await reader.read()).value);
  expect(chunk).toContain('id: 1');
  expect(chunk).toContain('Persistent event');
  expect(chunk).not.toContain('assistantRequest');
  controller.abort();
});

it('replays a recovered membership audit event after a reconnect cursor', async () => {
  const id = await create('room', ['bob']);
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  await request(`/conversations/${id}/participants`, 'alice', { handle: 'charlie' });
  const controller = new AbortController();
  try {
    const response = await fetch(`${base}/api/chat/conversations/${id}/events`, {
      headers: { 'x-test-user': 'bob', 'last-event-id': '1' },
      signal: controller.signal
    });
    const chunk = new TextDecoder().decode((await response.body!.getReader().read()).value);
    expect(chunk).toContain('alice invited charlie.');
    expect(chunk).not.toContain('bob joined the conversation.');
    expect(chunk).toContain('id: 2');
    expect(chunk).not.toContain('membershipEvents');
  } finally {
    controller.abort();
  }
});

it('streams reactions and unsend mutations even when their message sequence is already read', async () => {
  const id = await create();
  const source = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Secret original',
    clientId: 'mutation-stream-1'
  });
  const messageId = String(source.body.data._id);
  await request(`/conversations/${id}/messages/${messageId}/reaction`, 'alice', { emoji: '❤️' });
  const controller = new AbortController();
  try {
    const response = await fetch(`${base}/api/chat/conversations/${id}/events?after=${source.body.data.seq}`, {
      headers: { 'x-test-user': 'alice' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)])
    });
    const reader = response.body!.getReader();
    let text = '';
    while (!text.includes('❤️')) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain('event: message-updates');
    expect(text).not.toContain('Secret original');
    await request(`/conversations/${id}/messages/${messageId}/unsend`, 'alice', {});
    while (!text.includes('"unsentAt":"')) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain('"revision":2');
    expect(text).not.toContain('Secret original');
  } finally {
    controller.abort();
  }
});

it('sends a new message at once when told of it, without waiting for the next poll', async () => {
  const id = await create();
  const controller = new AbortController();
  try {
    const response = await fetch(`${base}/api/chat/conversations/${id}/events`, {
      headers: { 'x-test-user': 'alice' },
      signal: controller.signal
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Straight away', clientId: 'wake-stream-1' });
    // An idle stream polls every two seconds, so seeing it within one is the signal's doing.
    const started = Date.now();
    while (!text.includes('Straight away') && Date.now() - started < 1200) {
      const next = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200))]);
      if (next?.value) text += decoder.decode(next.value);
      else break;
    }
    expect(text).toContain('Straight away');
    expect(Date.now() - started).toBeLessThan(1200);
  } finally {
    controller.abort();
  }
});
