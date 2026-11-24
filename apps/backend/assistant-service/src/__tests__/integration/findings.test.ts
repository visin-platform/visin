import '../helpers/mocks';
import { deleteApiKey, fetchWithTimeout } from '@visin/backend-core';
import { vi, type Mock } from 'vitest';
import { Message } from '../helpers/fakeChat';
import { appendMessage } from '../helpers/fakeChat';
import { vision } from '../helpers/analystFixtures';
import { request, setupAssistantTests } from '../helpers/testServer';

setupAssistantTests();

const PROJECT = '111111111111111111111111';
/** A chat with the assistant, a question about a project in it, and the answer to that question. */
async function answered(clientId: string) {
  const created = await request('/conversations', 'alice', { kind: 'assistant', title: 'Vivi' });
  const id = String(created.body.data._id);
  const question = await appendMessage({
    conversationId: id,
    senderId: 'alice',
    senderName: 'alice',
    kind: 'person',
    body: 'What peaked?',
    clientId: `${clientId}-q`,
    context: { projectId: PROJECT, projectName: 'Lab', trainingIds: [], trainingLabels: [] }
  });
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Measured result',
    clientId,
    replyTo: question.id
  });
  return { id, answer };
}

it('saves a reviewed finding with assistant attribution credentials and deletes the temporary key', async () => {
  const { id, answer } = await answered('save-result-001');
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
  const { id, answer } = await answered('saved-already-1');
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
  const { id, answer } = await answered('refused-save-1');
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

it('refuses to save a finding from an answer to a question that was not about a project', async () => {
  const created = await request('/conversations', 'alice', { kind: 'assistant', title: 'Vivi' });
  const id = String(created.body.data._id);
  const question = await appendMessage({
    conversationId: id,
    senderId: 'alice',
    senderName: 'alice',
    kind: 'person',
    body: 'Hello',
    clientId: 'general-question-1'
  });
  const answer = await appendMessage({
    conversationId: id,
    senderId: 'analyst',
    senderName: 'Analyst',
    kind: 'assistant',
    body: 'Hi',
    clientId: 'general-answer-1',
    replyTo: question.id
  });
  const saved = await request(`/conversations/${id}/findings`, 'alice', { messageId: answer.id, title: 'x', body: 'x' });
  expect(saved.status).toBe(400);
});
