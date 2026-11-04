import '../helpers/mocks';
import { deleteApiKey, fetchWithTimeout } from '@visin/backend-core';
import { vi, type Mock } from 'vitest';
import { Message } from '../../models/Message';
import { appendMessage } from '../../services/messages';
import { vision } from '../helpers/analystFixtures';
import { request, setupChatTests } from '../helpers/testServer';

setupChatTests();

it('saves a reviewed finding with assistant attribution credentials and deletes the temporary key', async () => {
  const created = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Analysis',
    projectId: '111111111111111111111111'
  });
  const id = String(created.body.data._id);
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Measured result',
    clientId: 'save-result-001'
  });
  (fetchWithTimeout as Mock).mockImplementation(async function () {
    return new Response(JSON.stringify({ data: { _id: 'saved-finding' } }));
  });
  const saved = await request(`/conversations/${id}/findings`, 'alice', {
    messageId: answer.id,
    title: 'Peak',
    body: answer.body
  });
  expect(saved.status).toBe(200);
  expect((await Message.findById(answer.id))?.findingId).toBe('saved-finding');
  const outgoing = (fetchWithTimeout as Mock).mock.calls.find(
    (args) => args[1]?.method === 'POST' && String(args[0]).endsWith('/findings')
  );
  expect(JSON.parse(outgoing![1].body).sourceId).toBe(`chat:${answer.id}`);
  expect(deleteApiKey).toHaveBeenCalledWith('alice', 'key1');
  (fetchWithTimeout as Mock).mockImplementation(
    (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
  );
});

it('returns an already saved finding without minting another write key', async () => {
  vision(() => new Response(JSON.stringify({ data: { _id: 'should-not-be-called' } })));
  const created = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Analysis',
    projectId: '111111111111111111111111'
  });
  const id = String(created.body.data._id);
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Measured result',
    clientId: 'saved-already-1'
  });
  await Message.updateOne({ _id: answer.id }, { $set: { findingId: 'existing-finding' } });
  const { createApiKey } = await import('@visin/backend-core');
  vi.mocked(createApiKey).mockClear();
  const saved = await request(`/conversations/${id}/findings`, 'alice', {
    messageId: answer.id,
    title: 'Peak',
    body: 'x'
  });
  expect(saved.body.data._id).toBe('existing-finding');
  expect(createApiKey).not.toHaveBeenCalled();
  (fetchWithTimeout as Mock).mockImplementation(
    (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
  );
});

it('passes a refusal from vision-service through and reports its outages as a bad gateway', async () => {
  const created = await request('/conversations', 'alice', {
    kind: 'assistant',
    title: 'Analysis',
    projectId: '111111111111111111111111'
  });
  const id = String(created.body.data._id);
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Measured result',
    clientId: 'refused-save-1'
  });
  const save = () =>
    request(`/conversations/${id}/findings`, 'alice', { messageId: answer.id, title: 'Peak', body: 'x' });
  vision(() => new Response(JSON.stringify({ message: 'A cited run was removed' }), { status: 400 }));
  const refused = await save();
  expect(refused.status).toBe(400);
  expect(refused.body.message).toBe('A cited run was removed');
  vision(() => new Response('down', { status: 503 }));
  expect((await save()).status).toBe(502);
  (fetchWithTimeout as Mock).mockImplementation(
    (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
  );
});
