import type { Message } from '../types/chat';
export function evidenceLinks(message: Message) {
  const ids = new Set<string>();
  for (const e of message.evidence) {
    const input = e.input || {};
    if (typeof input.training === 'string' && /^[a-f\d]{24}$/i.test(input.training)) ids.add(input.training);
    if (Array.isArray(input.trainings))
      input.trainings.forEach((id) => {
        if (typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) ids.add(id);
      });
  }
  return [...ids];
}
export const PAGE = 50;
export const mergeMessages = (old: Message[], rows: Message[]) =>
  [...new Map([...old, ...rows].map((m) => [m._id, m])).values()].sort((a, b) => a.seq - b.seq);
