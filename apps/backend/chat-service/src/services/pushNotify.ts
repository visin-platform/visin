import { logger } from '@visin/backend-core';
import { setTimeout as delay } from 'node:timers/promises';
import { Conversation, type ChatConversation } from '../models/Conversation';
import { ConversationHidden } from '../models/ConversationHidden';
import { Message } from '../models/Message';
import { liveConversation } from './liveConversation';
import { attachmentSummary } from './attachments';
import { hasSubscription, sendToUsers } from './pushService';

/**
 * Give the foreground thread time to acknowledge a message: having a stream open (possibly on another device) does
 * not prove it was read, but a read receipt does.
 */
export const READ_RECEIPT_GRACE_MS = 1500;

const KINDS: ChatConversation['kind'][] = ['direct', 'room', 'group', 'project'];

interface Pushed {
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  attachments?: { kind?: string | null }[];
  seq: number;
  createdAt: Date;
}

/** What the notification says. Kept short: a lock screen truncates anyway. */
export const previewOf = (body: string): string => {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text || 'New message';
};

/**
 * People who should get a buzz for a message: active participants other than the sender who have not read it.
 * Someone who has never opened a group or project channel is not a participant yet (opening it adds them), so they
 * are not reached; the unread count in the app covers them.
 */
export function recipientsOf(
  conversation: Pick<ChatConversation, 'participants'>,
  senderId: string,
  seq: number
): string[] {
  return conversation.participants
    .filter((p) => p.state === 'active' && p.userId !== senderId && Math.max(p.readSeq, p.joinedSeq) < seq)
    .map((p) => p.userId);
}

/**
 * Sends the notification for a new message.
 *
 * Never awaited by the send path and never allowed to throw: the message is already stored, and a push service being
 * slow or down must not turn a delivered message into a failed request. A dropped notification costs a buzz; a
 * failed send costs the message. Analyst threads are not notified: the person is looking at them.
 */
export async function notifyNewMessage(
  conversation: ChatConversation,
  message: Pushed,
  graceMs = READ_RECEIPT_GRACE_MS
): Promise<void> {
  try {
    if (!KINDS.includes(conversation.kind)) return;
    const first = recipientsOf(conversation, message.senderId, message.seq);
    // Nobody to buzz, or nobody with a device: skip the wait altogether.
    if (first.length === 0 || !(await hasSubscription(first))) return;

    await delay(graceMs);
    const fresh = await Conversation.findById(conversation._id.toString()).select('participants kind title deletedAt');
    if (!fresh || fresh.deletedAt) return;
    const recipients = recipientsOf(fresh, message.senderId, message.seq);
    if (recipients.length === 0) return;

    const conversationId = conversation._id.toString();
    await sendToUsers(
      recipients,
      {
        title: conversation.kind === 'direct' ? message.senderName : `${message.senderName} · ${fresh.title}`,
        body: message.body.trim() ? previewOf(message.body) : attachmentSummary(message.attachments) || 'New message',
        // One notification per conversation rather than one per message: ten messages while the phone is in a
        // pocket are one buzz and one line in the shade.
        tag: conversationId,
        url: `/chat?conversation=${conversationId}`,
        conversationId,
        sentAt: message.createdAt.getTime()
      },
      // The same collapsing, one step earlier: while a browser is closed its push service holds only the newest push
      // for each conversation. An ObjectId is 24 hex characters, inside the Topic header's 32.
      { topic: conversationId }
    );
  } catch (error) {
    logger.warn('Chat notification failed', { error: (error as Error).message });
  }
}

/**
 * Conversations with messages from other people that this person has not read, for the app icon's badge and the
 * stale-push check. The counters alone would count the person's own last message as unread, so a conversation that
 * looks behind is confirmed against the messages themselves.
 */
export async function unreadFor(userId: string, conversationId?: string) {
  // Only chats the person can open: an old chat with an assistant is never listed, so it could never be read either.
  const [rows, hidden] = await Promise.all([
    Conversation.find({ ...liveConversation, participants: { $elemMatch: { userId, state: 'active' } } })
      .select('participants seq lastMessageSeq')
      .limit(200),
    ConversationHidden.find({ userId }).select('conversationId seq').limit(500)
  ]);
  const hiddenAt = new Map(hidden.map((row) => [row.conversationId, row.seq]));
  const behind = rows.flatMap((row) => {
    const me = row.participants.find((p) => p.userId === userId);
    const id = row._id.toString();
    const away = hiddenAt.get(id);
    const seen = Math.max(me?.readSeq ?? 0, me?.joinedSeq ?? 0, away ?? 0);
    if ((row.lastMessageSeq ?? row.seq) <= seen) return [];
    // A hidden chat counts only for what brings it back: someone else writing in it, not an assistant answering.
    return [{ conversationId: id, seq: { $gt: seen }, ...(away === undefined ? {} : { kind: 'person' as const }) }];
  });
  // One query for all of them, each branch on the (conversationId, seq) index, rather than one per conversation.
  const unread = new Set<string>(
    behind.length === 0
      ? []
      : ((await Message.distinct('conversationId', { $or: behind, senderId: { $ne: userId } })) as string[]).map(String)
  );
  return { unread: unread.size, ...(conversationId ? { fresh: unread.has(conversationId) } : {}) };
}
