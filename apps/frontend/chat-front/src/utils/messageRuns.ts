import type { Message } from '../types/chat';

/** Messages from one sender this close together read as one run: named once, timed once. */
export const RUN_WINDOW_MS = 2 * 60 * 1000;

const sender = (message: Message) => `${message.kind}:${message.senderId ?? ''}:${message.senderName}`;

/** Whether `next` carries on the run `message` is in: same sender, same day, within the window, neither a notice. */
export function continuesRun(message: Message | undefined, next: Message | undefined): boolean {
  if (!message || !next) return false;
  if (message.kind === 'system' || next.kind === 'system') return false;
  if (sender(message) !== sender(next)) return false;
  const from = new Date(message.createdAt);
  const to = new Date(next.createdAt);
  return from.toDateString() === to.toDateString() && to.getTime() - from.getTime() <= RUN_WINDOW_MS;
}
