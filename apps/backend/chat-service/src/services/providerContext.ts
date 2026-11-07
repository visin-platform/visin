interface Block {
  type?: string;
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
const MARKER = '\n[TRUNCATED FOR CONTEXT: omitted data is unknown; fetch a narrower result before making claims.]\n';

/** Fit the serialized provider envelope, including schemas, without breaking tool exchanges. */
export function fitProviderContext(payload: string, maxBytes: number): string {
  const size = () => Buffer.byteLength(payload, 'utf8');
  if (size() <= maxBytes) return payload;
  const envelope = JSON.parse(payload) as { messages: Message[] };
  const messages = envelope.messages;
  const serialize = () => {
    payload = JSON.stringify(envelope);
  };
  const isQuestion = (m: Message) => m.role === 'user' && typeof m.content === 'string';
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
      messages.splice(i, 2);
      serialize();
      if (size() <= maxBytes) return payload;
    } else i++;
  }
  const shorten = (text: string): string => {
    const target = Math.max(256, text.length - (size() - maxBytes) - MARKER.length - 32);
    if (target >= text.length) return text;
    const tail = Math.min(256, Math.floor(target / 4));
    return text.slice(0, target - tail) + MARKER + text.slice(-tail);
  };
  // Oldest results go first. Keep IDs and error flags intact, and never rewrite the verified context.
  for (const message of messages) {
    if (
      ((message.role === 'tool' && message.tool_call_id !== 'visin_context') ||
        (message.role === 'assistant' && message.tool_calls?.length)) &&
      typeof message.content === 'string'
    ) {
      message.content = shorten(message.content);
      serialize();
      if (size() <= maxBytes) return payload;
    }
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === 'tool_result' && block.tool_use_id !== 'visin_context' && typeof block.content === 'string')
        block.content = shorten(block.content);
      else if (message.role === 'assistant' && block.type === 'text' && typeof block.text === 'string')
        block.text = shorten(block.text);
      else continue;
      serialize();
      if (size() <= maxBytes) return payload;
    }
  }
  // The caller retains the hard ceiling when schemas, current question, or protected context cannot fit.
  return payload;
}
