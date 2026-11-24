import '../helpers/mocks';
import { expect, it, vi } from 'vitest';
import { logger } from '@visin/backend-core';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import {
  ackRequest,
  cancelRequests,
  saveSharedAssistants,
  setConversationContext,
  setMessageFinding
} from '../../services/assistantApi';
import { startMembershipRecovery } from '../../services/membershipAudit';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

/** A question to the analyst, saved with its hidden request, as sending one does. */
async function ask(user: string, id: string, clientId: string) {
  const sent = await request(`/conversations/${id}/messages`, user, { body: 'How is it going?', clientId });
  expect(sent.status).toBe(201);
  return String(sent.body.data._id);
}
const pending = async (messageId: string) => {
  const row = await Message.findById(messageId).select('+assistantRequest +screenRequest +assistantCancelled');
  return { requested: Boolean(row?.assistantRequest), cancelled: row?.assistantCancelled === true };
};

// What the assistant service may change in chat, and nothing more: each of these is one internal route.
it('takes a question back by its message', async () => {
  const id = await create('assistant', []);
  const message = await ask('alice', id, 'api-cancel-1');
  expect(await pending(message)).toEqual({ requested: true, cancelled: false });
  await cancelRequests({ messageId: message });
  expect(await pending(message)).toEqual({ requested: false, cancelled: true });
});

it("takes back one person's open questions in a conversation, and no one else's", async () => {
  const mine = await create('assistant', []);
  const first = await ask('alice', mine, 'api-cancel-2');
  // A person has one private chat with the assistant, so someone else's questions are in theirs.
  const theirs = String((await request('/conversations', 'bob', { kind: 'assistant', title: 'Research', handles: [] })).body.data._id);
  const elsewhere = await ask('bob', theirs, 'api-cancel-3');
  await cancelRequests({ conversationId: mine, senderId: 'alice', messageIds: [] });
  expect((await pending(first)).cancelled).toBe(true);
  expect((await pending(elsewhere)).cancelled).toBe(false);
  // The same conversation, another sender: nothing of alice's own is touched by bob's cancel.
  const second = await ask('alice', mine, 'api-cancel-5');
  await cancelRequests({ conversationId: mine, senderId: 'bob', messageIds: [] });
  expect((await pending(second)).cancelled).toBe(false);
});

it('takes back every pending question for an assistant that was paused', async () => {
  const id = await create('assistant', []);
  const message = await ask('alice', id, 'api-cancel-4');
  await Message.updateOne({ _id: message }, { $set: { 'assistantRequest.assistantId': 'bot-1' } });
  await cancelRequests({ assistantId: 'someone-elses' });
  expect((await pending(message)).requested).toBe(true);
  await cancelRequests({ assistantId: 'bot-1' });
  expect(await pending(message)).toEqual({ requested: false, cancelled: true });
});

it('acknowledges a request once it has become a run, and records a finding on a message', async () => {
  const id = await create('assistant', []);
  const message = await ask('alice', id, 'api-ack-1');
  await ackRequest(message);
  expect(await pending(message)).toEqual({ requested: false, cancelled: false });
  await setMessageFinding(message, 'finding-1');
  expect((await Message.findById(message))?.findingId).toBe('finding-1');
});

it("keeps the runs an assistant chose with the person's own chat, and only there", async () => {
  const id = await create('assistant', []);
  const labels = [{ id: 'r1', name: 'Run one' }];
  expect(await setConversationContext({ conversationId: id, userId: 'alice', trainingIds: ['r1'], trainingLabels: labels })).toBe(true);
  expect((await Conversation.findById(id))?.trainingIds).toEqual(['r1']);
  // Not their chat, and not a private assistant chat at all.
  expect(await setConversationContext({ conversationId: id, userId: 'bob', trainingIds: [], trainingLabels: [] })).toBe(false);
  const room = await create('room', ['bob']);
  expect(await setConversationContext({ conversationId: room, userId: 'alice', trainingIds: [], trainingLabels: [] })).toBe(false);
});

it('saves a change to shared assistants as a new membership version, once, and refuses a stale one', async () => {
  const id = await create('room', ['bob']);
  const before = await Conversation.findById(id);
  const change = {
    conversationId: id,
    expectedVersion: before!.__v,
    botIds: ['bot-a'],
    policy: { enabled: true, lockedOff: false, whoCanAdd: 'admins' as const, consents: [{ userId: 'alice', audience: 'room' }] }
  };
  const saved = await saveSharedAssistants(change);
  expect(saved?.membershipVersion).toBe(before!.membershipVersion + 1);
  const after = await Conversation.findById(id);
  expect(after?.sharedAssistantIds).toEqual(['bot-a']);
  expect(after?.sharedAssistants?.whoCanAdd).toBe('admins');
  // The same change again was made on a version that is gone.
  expect(await saveSharedAssistants({ ...change, botIds: ['bot-b'] })).toBeNull();
  expect((await Conversation.findById(id))?.sharedAssistantIds).toEqual(['bot-a']);
});

// Chat's own recovery of membership events a crash left behind, with nothing of the assistants running.
it('looks for unfinished membership events now and then, and says when it cannot', async () => {
  vi.useFakeTimers();
  try {
    const find = vi.spyOn(Conversation, 'find');
    const stop = startMembershipRecovery();
    await vi.advanceTimersByTimeAsync(5000);
    expect(find).toHaveBeenCalledTimes(1);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    find.mockImplementationOnce(() => {
      throw new Error('database away');
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(warn).toHaveBeenCalledWith('Membership event recovery failed', { error: 'database away' });
    stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(find).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});
