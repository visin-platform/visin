import { logger } from '@visin/backend-core';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';

/** Membership and its reserved audit sequence are saved in the same conversation document. */
export async function flushMembershipEvents(conversationId: string) {
  const c = await Conversation.findById(conversationId).select('+membershipEvents');
  for (const event of c?.membershipEvents || []) {
    await Message.updateOne(
      { conversationId, clientId: event.clientId },
      {
        $setOnInsert: {
          conversationId,
          clientId: event.clientId,
          seq: event.seq,
          senderId: 'system:membership',
          senderName: 'System',
          kind: 'system',
          body: event.body,
          createdAt: event.at
        }
      },
      { upsert: true }
    );
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $pull: { membershipEvents: { clientId: event.clientId } },
        $max: { lastMessageSeq: event.seq }
      }
    );
  }
}

export async function recoverMembershipEvents() {
  const pending = await Conversation.find({ 'membershipEvents.0': { $exists: true } })
    .select('_id')
    .limit(100);
  for (const c of pending) await flushMembershipEvents(c.id);
}

const RECOVERY_MS = 5_000;
/** Finishes membership events a crash left in a conversation, now and then: chat's own, so it runs with chat. */
export function startMembershipRecovery(): () => void {
  const timer = setInterval(() => {
    recoverMembershipEvents().catch((error: Error) =>
      logger.warn('Membership event recovery failed', { error: error.message })
    );
  }, RECOVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
