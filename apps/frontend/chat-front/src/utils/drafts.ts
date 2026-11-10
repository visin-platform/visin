import type { Draft, Message } from '../types/chat';

/**
 * The drafts worth showing: those with something written, whose answer is not a message yet. The server keeps a draft
 * until its answer is published, so a draft and its message can both exist for a moment: the message wins, and the
 * text never appears twice.
 */
export function visibleDrafts(drafts: Draft[], messages: Message[]): Draft[] {
  const answered = new Set(messages.filter((message) => message.kind === 'assistant').map((message) => message.replyTo));
  return drafts.filter((draft) => draft.text && !answered.has(draft.messageId));
}
