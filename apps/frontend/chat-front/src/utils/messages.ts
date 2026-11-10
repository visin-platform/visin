import type { Message, MessageUpdate } from '../types/chat';
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
/** Apply revisioned patches so a slow HTTP response cannot resurrect an unsent message. */
export function applyMessageUpdates(rows: Message[], updates: MessageUpdate[]): Message[] {
  const patches = new Map(updates.map((update) => [update._id, update]));
  const removed = new Set([...rows, ...updates].filter((row) => row.unsentAt).map((row) => row._id));
  return rows.map((row) => {
    const patch = patches.get(row._id);
    let result = patch && (patch.revision ?? 0) >= (row.revision ?? 0) ? { ...row, ...patch } : row;
    if (result.unsentAt)
      result = { ...result, body: '', attachments: [], evidence: [], quote: undefined, reactions: [] };
    else if (result.quote && removed.has(result.quote.messageId))
      result = { ...result, quote: { ...result.quote, body: 'Message unsent', unsent: true } };
    return result;
  });
}
export function mergeMessages(old: Message[], rows: Message[]) {
  const byId = new Map(old.map((row) => [row._id, row]));
  for (const row of rows) if ((row.revision ?? 0) >= (byId.get(row._id)?.revision ?? 0)) byId.set(row._id, row);
  return applyMessageUpdates(
    [...byId.values()].sort((a, b) => a.seq - b.seq),
    []
  );
}
