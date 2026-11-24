import '../helpers/mocks';
import { vi } from 'vitest';
import { BadRequestError } from '@visin/backend-core';
import { Message } from '../../models/Message';
import * as assistants from '../../services/assistantClient';
import { appendMessage } from '../../services/messages';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

type View = {
  _id: string;
  body: string;
  unsentAt?: string | null;
  supersededAt?: string | null;
  kind: string;
  replyTo?: string;
};

/** A chat with Vivi where one question has been asked and answered. */
async function answered() {
  const id = await create('assistant', []);
  const asked = await request<View>(`/conversations/${id}/messages`, 'alice', {
    body: 'Which run is best?',
    clientId: 'first-question-1'
  });
  await appendMessage({
    conversationId: id,
    senderId: 'assistant:bot-1',
    senderName: 'Bot',
    kind: 'assistant',
    body: 'Run A is best.',
    clientId: `assistant:${asked.body.data._id}`,
    replyTo: asked.body.data._id
  });
  return { id, question: asked.body.data };
}
const rows = async (id: string, user = 'alice') =>
  (await request<View[]>(`/conversations/${id}/messages`, user)).body.data;
const edit = (id: string, messageId: string, body: Record<string, unknown>, user = 'alice') =>
  request<View>(`/conversations/${id}/messages/${messageId}/edit`, user, body);

describe('editing the last question', () => {
  it('asks again with the new words, and retires the old question and its answer', async () => {
    const { id, question } = await answered();
    expect((await rows(id)).filter((row) => row.kind === 'assistant')).toHaveLength(1);

    const edited = await edit(id, question._id, {
      body: 'Which run is best on night scenes?',
      clientId: 'edited-question-1'
    });
    expect(edited.status).toBe(201);
    expect(edited.body.data).toMatchObject({ body: 'Which run is best on night scenes?', kind: 'person' });

    // The old pair is retired: hidden, not deleted, and gone from what anyone reads of them.
    const all = await rows(id);
    const old = all.find((row) => row._id === question._id)!;
    expect(old).toMatchObject({ body: '', unsentAt: expect.any(String), supersededAt: expect.any(String) });
    const oldAnswer = all.find((row) => row.kind === 'assistant')!;
    expect(oldAnswer).toMatchObject({ body: '', supersededAt: expect.any(String) });
    expect(JSON.stringify(all)).not.toContain('Run A is best');
    expect(JSON.stringify(all)).not.toContain('Which run is best?');
    // Whatever was made of the old question is the assistant service's to withdraw, and it is asked to.
    expect(assistants.cancelMessageRuns).toHaveBeenCalledWith({ conversationId: id, messageId: question._id });
    // Nothing of the old pair is left standing as an answer.
    expect((await rows(id)).filter((row) => row.kind === 'assistant' && !row.supersededAt)).toEqual([]);
  });

  it('cancels a question that is still being answered, and a repeated edit changes nothing more', async () => {
    const id = await create('assistant', []);
    const asked = (
      await request<View>(`/conversations/${id}/messages`, 'alice', {
        body: 'First wording',
        clientId: 'pending-question-1'
      })
    ).body.data;
    const body = { body: 'Second wording', clientId: 'edited-pending-1' };
    const first = await edit(id, asked._id, body);
    expect(first.status).toBe(201);
    expect(assistants.cancelMessageRuns).toHaveBeenCalledWith({ conversationId: id, messageId: asked._id });
    // The same request again (a network retry) returns the same question and retires nothing a second time.
    const again = await edit(id, asked._id, body);
    expect(again.status).toBe(200);
    expect(again.body.data._id).toBe(first.body.data._id);
    expect((await rows(id)).filter((row) => row.kind === 'person' && !row.unsentAt)).toHaveLength(1);
  });

  it('finishes the retirement when the first request died after sending the new question', async () => {
    const { id, question } = await answered();
    const body = { body: 'Reworded', clientId: 'interrupted-edit-1' };
    // The new question was stored, and nothing else happened.
    await request(`/conversations/${id}/messages`, 'alice', body);
    const finished = await edit(id, question._id, body);
    expect(finished.status).toBe(200);
    expect((await Message.findById(question._id))?.unsentAt).toBeTruthy();
    expect((await rows(id)).filter((row) => row.kind === 'assistant' && !row.supersededAt)).toEqual([]);
  });

  it('is only for your own latest text question, in your private chat with an assistant', async () => {
    const { id, question } = await answered();
    expect((await edit(id, question._id, { body: 'Reworded', clientId: 'edit-by-bob-1' }, 'bob')).status).toBe(404);
    // Not an earlier question once a later one exists.
    await request(`/conversations/${id}/messages`, 'alice', { body: 'A later question', clientId: 'later-question-1' });
    const refused = await edit(id, question._id, { body: 'Reworded', clientId: 'too-late-1' });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain('latest question');
    expect((await Message.findById(question._id))?.unsentAt).toBeNull();

    // Not a question that was already taken back, one with files, or one in a chat between people.
    const unsentId = (await rows(id)).at(-1)!._id;
    await request(`/conversations/${id}/messages/${unsentId}/unsend`, 'alice', {});
    expect((await edit(id, unsentId, { body: 'Reworded', clientId: 'after-unsend-1' })).status).toBe(400);
    const people = await create();
    await request(`/conversations/${people}/membership`, 'bob', { action: 'accept' });
    const sentHello = await request<View>(`/conversations/${people}/messages`, 'alice', {
      body: 'Hello',
      clientId: 'hello-message-1'
    });
    const hello = sentHello.body.data;
    expect((await edit(people, hello._id, { body: 'Hi', clientId: 'edit-direct-1' })).status).toBe(400);
  });

  it('refuses files, an empty question, and an edit of a question that has files', async () => {
    const { id, question } = await answered();
    expect((await edit(id, question._id, { body: '', clientId: 'empty-edit-1' })).status).toBe(400);
    expect(
      (
        await edit(id, question._id, {
          body: 'Reworded',
          clientId: 'files-edit-1',
          attachments: [{ fileId: `chat/${id}/a.png`, name: 'a.png', kind: 'image', mime: 'image/png', size: 1 }]
        })
      ).status
    ).toBe(400);
    // Refused, so the old question and its answer are as they were.
    expect((await Message.findById(question._id))?.unsentAt).toBeNull();
    expect((await rows(id)).filter((row) => row.kind === 'assistant' && !row.supersededAt)).toHaveLength(1);
  });

  it('lets only one of two edits of the same question through, and frees it when an edit is refused', async () => {
    const { id, question } = await answered();
    const [first, second] = await Promise.all([
      edit(id, question._id, { body: 'Wording from one tab', clientId: 'race-edit-one' }),
      edit(id, question._id, { body: 'Wording from another', clientId: 'race-edit-two' })
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    // One new question, and the old pair retired: never two live questions.
    expect((await rows(id)).filter((row) => row.kind === 'person' && !row.unsentAt)).toHaveLength(1);

    // An edit that is refused (the assistant went off) leaves the question free to be edited again.
    const later = (
      await request<View>(`/conversations/${id}/messages`, 'alice', {
        body: 'A later one',
        clientId: 'later-edit-source'
      })
    ).body.data;
    vi.mocked(assistants.prepare).mockRejectedValueOnce(new BadRequestError('The assistant is not configured. Human messaging is available.'));
    expect((await edit(id, later._id, { body: 'Reworded later', clientId: 'refused-edit-1' })).status).toBe(400);
    expect((await Message.findById(later._id).select('+editClaim'))?.editClaim).toBeUndefined();
    expect((await edit(id, later._id, { body: 'Reworded later', clientId: 'accepted-edit-1' })).status).toBe(201);
  });

  it('takes over a claim that was never finished, once it has expired', async () => {
    const { id, question } = await answered();
    await Message.updateOne(
      { _id: question._id },
      { $set: { editClaim: { by: 'died-request-1', at: new Date(Date.now() - 60_000) } } }
    );
    expect((await edit(id, question._id, { body: 'Reworded', clientId: 'takeover-edit-1' })).status).toBe(201);
    // A claim that is still fresh blocks another edit of that question.
    const next = (
      await request<View>(`/conversations/${id}/messages`, 'alice', {
        body: 'Another question',
        clientId: 'another-question-1'
      })
    ).body.data;
    await Message.updateOne({ _id: next._id }, { $set: { editClaim: { by: 'busy-request-1', at: new Date() } } });
    const refused = await edit(id, next._id, { body: 'Reworded', clientId: 'blocked-edit-1' });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain('already being edited');
  });

  it('does not reuse the id of an earlier message', async () => {
    const { id, question } = await answered();
    const refused = await edit(id, question._id, { body: 'Reworded', clientId: 'first-question-1' });
    expect(refused.status).toBe(400);
    expect((await Message.findById(question._id))?.unsentAt).toBeNull();
  });
});
