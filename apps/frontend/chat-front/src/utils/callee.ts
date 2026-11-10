import type { Conversation } from '../types/chat';

/** Whether this conversation is the kind a call can be placed in, and if not yet, why. Null where it never could be. */
export type Callability =
  | { callable: true; them: Conversation['participants'][number] }
  | { callable: false; reason: string };

/**
 * A direct message between two people can be called. Whether it can be called *now* depends on both having joined: a
 * message request nobody has accepted cannot, and says so rather than hiding the buttons. Rooms, groups, the
 * analyst's threads and a thread with an assistant are not places for a call at all.
 */
export function callability(
  conversation: Conversation,
  userId: string | undefined,
  name = 'They'
): Callability | null {
  if (conversation.kind !== 'direct' || conversation.assistantId || conversation.participants.length !== 2) return null;
  const me = conversation.participants.find((p) => p.userId === userId);
  const them = conversation.participants.find((p) => p.userId !== userId);
  if (!me || !them) return null;
  if (me.state === 'active' && them.state === 'active') return { callable: true, them };
  if (me.state === 'invited') return { callable: false, reason: 'Accept the message request to call.' };
  if (them.state === 'invited') return { callable: false, reason: `You can call once ${name} accepts your message request.` };
  return { callable: false, reason: 'This conversation is closed.' };
}

/** The person on the other end, when a call can be placed now; otherwise nobody. */
export function calleeOf(conversation: Conversation, userId: string | undefined) {
  const found = callability(conversation, userId);
  return found?.callable ? found.them : null;
}
