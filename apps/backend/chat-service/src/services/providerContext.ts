interface Block {
  type?: string;
  signature?: string;
  text?: string;
  content?: string;
  tool_use_id?: string;
}
interface Message {
  role?: string;
  content?: string | Block[] | null;
  tool_call_id?: string;
  tool_calls?: unknown[];
}
/** The first `end` characters, without ending in half of a character that takes two (an emoji, a rare symbol). */
export function headText(text: string, end: number): string {
  const last = text.charCodeAt(end - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? end - 1 : end);
}

/** The last `count` characters, without starting in the second half of one that takes two. */
export function tailText(text: string, count: number): string {
  if (count <= 0) return '';
  const start = text.length - count;
  const first = text.charCodeAt(start);
  return text.slice(first >= 0xdc00 && first <= 0xdfff ? start + 1 : start);
}

const MARKER = '\n[TRUNCATED FOR CONTEXT: omitted data is unknown; fetch a narrower result before making claims.]\n';

const SIGNED_REASONING = new Set(['thinking', 'redacted_thinking']);

/**
 * Fit the serialized provider envelope, including schemas, without breaking tool exchanges.
 *
 * A model's thinking block is valid only after exactly the messages it was written after: the provider refuses one
 * replayed after any change to them ("Invalid `signature` in `thinking` block"). Fitting changes earlier messages, and
 * cuts them afresh each round from the whole run, so every thinking block from the first changed message on is left
 * out. The ones before it still follow what they were written after, and leaving out a trailing run is allowed.
 */
export function fitProviderContext(payload: string, maxBytes: number): string {
  const size = () => Buffer.byteLength(payload, 'utf8');
  if (size() <= maxBytes) return payload;
  const envelope = JSON.parse(payload) as { messages: Message[] };
  const messages = envelope.messages;
  const serialize = () => {
    payload = JSON.stringify(envelope);
  };
  /** Message `index` (as the array now stands) is about to change: drop the reasoning it and every later one carry. */
  let firstChanged = Infinity;
  const changing = (index: number) => {
    if (index >= firstChanged) return;
    for (const message of messages.slice(index, firstChanged)) {
      if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
      const kept = message.content.filter((block) => !SIGNED_REASONING.has(block.type ?? ''));
      // A turn of reasoning alone would become empty, which the provider refuses too; none is sent today.
      if (kept.length) message.content = kept;
    }
    firstChanged = index;
  };
  const isQuestion = (m: Message) =>
    m.role === 'user' &&
    (typeof m.content === 'string' ||
      (Array.isArray(m.content) &&
        m.content.length > 0 &&
        m.content.every((block) => ['text', 'image', 'image_url'].includes(block.type ?? ''))));
  const latestQuestion = messages.findLast(isQuestion);
  // Discard complete older conversational turns; keep seeded application context and the current ask.
  for (let i = 1; i < messages.indexOf(latestQuestion!);) {
    const next = messages[i + 1];
    if (
      isQuestion(messages[i]) &&
      next?.role === 'assistant' &&
      typeof next.content === 'string' &&
      !next.tool_calls?.length
    ) {
      // Everything after the removed turn now follows other messages.
      changing(i);
      messages.splice(i, 2);
      serialize();
      if (size() <= maxBytes) return payload;
    } else i++;
  }
  const shorten = (text: string): string => {
    const target = Math.max(256, text.length - (size() - maxBytes) - MARKER.length - 32);
    if (target >= text.length) return text;
    const tail = Math.min(256, Math.floor(target / 4));
    return headText(text, target - tail) + MARKER + tailText(text, tail);
  };
  // Oldest results go first. Keep IDs and error flags intact, and never rewrite the verified context.
  for (const [index, message] of messages.entries()) {
    if (
      ((message.role === 'tool' && message.tool_call_id !== 'visin_context') ||
        (message.role === 'assistant' && message.tool_calls?.length)) &&
      typeof message.content === 'string'
    ) {
      const shortened = shorten(message.content);
      if (shortened === message.content) continue;
      changing(index);
      message.content = shortened;
      serialize();
      if (size() <= maxBytes) return payload;
    }
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === 'tool_result' && block.tool_use_id !== 'visin_context' && typeof block.content === 'string') {
        const shortened = shorten(block.content);
        if (shortened === block.content) continue;
        changing(index);
        block.content = shortened;
      } else if (message.role === 'assistant' && block.type === 'text' && typeof block.text === 'string') {
        const shortened = shorten(block.text);
        if (shortened === block.text) continue;
        changing(index);
        block.text = shortened;
      } else continue;
      serialize();
      if (size() <= maxBytes) return payload;
    }
  }
  // The caller retains the hard ceiling when schemas, current question, or protected context cannot fit.
  return payload;
}
