import type { Conversation } from '../types/chat';

/** Messages after the ones this person has read. A room counts only from when they joined. */
export function unreadCount(conversation: Conversation, userId: string | undefined): number {
  const member = conversation.participants.find((p) => p.userId === userId);
  const seen = Math.max(member?.readSeq || 0, member?.joinedSeq || 0);
  return Math.max(0, (conversation.lastMessageSeq ?? conversation.seq) - seen);
}
