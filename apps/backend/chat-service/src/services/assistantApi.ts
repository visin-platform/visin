import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';

/**
 * What Vivi may change in chat's data, and nothing more. Everything else of chat's it only reads, and a message it
 * publishes goes through `appendMessage`. Each function here is one internal route when Vivi is its own service
 * (`/internal/assistant/*`), so what they take and return is plain data.
 */

/** A question to an assistant is selected by one of these. */
export type RequestSelector =
  | { messageId: string }
  /** A person's open questions in one conversation (and the named messages, whose runs are still going). */
  | { conversationId: string; senderId: string; messageIds: string[] }
  /** Every pending question for one assistant, when it is paused or removed. */
  | { assistantId: string };

const CANCELLED = { $unset: { assistantRequest: 1, screenRequest: 1 }, $set: { assistantCancelled: true } };

/** Takes a question back before it is answered: its hidden request is removed and it is marked cancelled. */
export async function cancelRequests(selector: RequestSelector): Promise<void> {
  if ('messageId' in selector) {
    await Message.updateOne({ _id: selector.messageId }, CANCELLED);
  } else if ('assistantId' in selector) {
    await Message.updateMany(
      { $or: [{ 'assistantRequest.assistantId': selector.assistantId }, { 'screenRequest.assistantId': selector.assistantId }] },
      CANCELLED
    );
  } else {
    await Message.updateMany(
      {
        conversationId: selector.conversationId,
        senderId: selector.senderId,
        $or: [
          { assistantRequest: { $exists: true } },
          { screenRequest: { $exists: true } },
          { _id: { $in: selector.messageIds } }
        ]
      },
      CANCELLED
    );
  }
}

/** The worker has made a run of the question, so the hidden request is done with. */
export async function ackRequest(messageId: string): Promise<void> {
  await Message.updateOne({ _id: messageId }, { $unset: { assistantRequest: 1, screenRequest: 1 } });
}

/** An answer was saved as a finding: the message remembers which. */
export async function setMessageFinding(messageId: string, findingId: string): Promise<void> {
  await Message.updateOne({ _id: messageId }, { $set: { findingId } });
}

/**
 * The runs an assistant chose to compare, kept with the person's private chat so its page shows them. False when the
 * chat is gone or the person is no longer in it.
 */
export async function setConversationContext(input: {
  conversationId: string;
  userId: string;
  trainingIds: string[];
  trainingLabels: { id: string; name: string }[];
}): Promise<boolean> {
  const updated = await Conversation.updateOne(
    {
      _id: input.conversationId,
      kind: 'assistant',
      deletedAt: null,
      participants: { $elemMatch: { userId: input.userId, state: 'active' } }
    },
    { $set: { trainingIds: input.trainingIds, trainingLabels: input.trainingLabels } }
  );
  return updated.matchedCount > 0;
}

/** The shared-assistant state a change makes of a conversation: which bots are in it, and its policy and consents. */
export interface SharedAssistantsState {
  botIds: string[];
  policy: {
    enabled: boolean;
    lockedOff: boolean;
    whoCanAdd?: 'everyone' | 'admins';
    consents: { userId: string; audience: string }[];
  };
}

/**
 * Saves a change to a conversation's shared assistants, as a new membership version: the audience changed, so earlier
 * agreements and pending questions are judged against it. Only when the conversation is still at the version the
 * change was made on; otherwise null, and nothing is written.
 */
export async function saveSharedAssistants(
  input: SharedAssistantsState & { conversationId: string; expectedVersion: number }
): Promise<{ membershipVersion: number } | null> {
  const saved = await Conversation.findOneAndUpdate(
    { _id: input.conversationId, __v: input.expectedVersion, deletedAt: null },
    {
      $set: { sharedAssistantIds: input.botIds, sharedAssistants: input.policy },
      $inc: { membershipVersion: 1, __v: 1 }
    },
    { returnDocument: 'after' }
  ).select('membershipVersion');
  return saved ? { membershipVersion: saved.membershipVersion } : null;
}
