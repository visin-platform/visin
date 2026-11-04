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
