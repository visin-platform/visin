import { Message } from '../models/Message';

/** Redact quoted snapshots at read time too, including replies racing an unsend. */
export async function redactQuotes(
  rows: { conversationId: string; quote?: { messageId: string; body: string; unsent?: boolean | null } | null }[]
) {
  const ids = [...new Set(rows.flatMap((row) => (row.quote ? [row.quote.messageId] : [])))];
  if (!ids.length) return;
  const removed = new Set(
    (
      await Message.find({ conversationId: rows[0].conversationId, _id: { $in: ids }, unsentAt: { $ne: null } })
        .select('_id')
        .lean()
    ).map((row) => String(row._id))
  );
  for (const row of rows)
    if (row.quote && removed.has(row.quote.messageId)) {
      row.quote.body = 'Message unsent';
      row.quote.unsent = true;
    }
}
