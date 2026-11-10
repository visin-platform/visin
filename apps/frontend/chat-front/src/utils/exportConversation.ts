import { chatService } from '../services/chatService';
import type { Message } from '../types/chat';

const heading = (text: string) => text.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]<>#!|]/g, '\\$&');

/** Read every authorized history page, starting at the latest messages visible when export starts. */
export async function exportHistory(conversationId: string, signal: AbortSignal): Promise<Message[]> {
  const messages = new Map<string, Message>();
  let before: number | undefined;
  for (;;) {
    signal.throwIfAborted();
    const page = await chatService.messages(conversationId, signal, before);
    signal.throwIfAborted();
    if (!page.length) break;
    const next = Math.min(...page.map((message) => message.seq));
    if (!Number.isSafeInteger(next) || (before !== undefined && next >= before))
      throw new Error('Could not load older messages. Please try again.');
    for (const message of page) messages.set(message._id, message);
    before = next;
  }
  return [...messages.values()].sort((a, b) => a.seq - b.seq);
}

/** Keep message Markdown intact, but never export signed file URLs or hidden tool payloads. */
export function conversationMarkdown(title: string, messages: Message[]): string {
  const parts = [`# ${heading(title)}`, 'Attachments are listed by name; their files are not included.'];
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const timestamp = Number.isNaN(date.getTime()) ? '' : date.toISOString();
    parts.push(`## ${heading(message.senderName || message.kind)}${timestamp ? ` · ${timestamp}` : ''}`);
    if (message.unsentAt) {
      parts.push('Message unsent');
      continue;
    }
    if (message.quote) {
      const quote = message.quote.unsent ? 'Message unsent' : message.quote.body;
      parts.push(
        `> Reply to ${heading(message.quote.senderName)}\n>\n${quote
          .split(/\r?\n/)
          .map((line) => `> ${line}`)
          .join('\n')}`
      );
    }
    if (message.body) parts.push(message.body);
    if (message.attachments?.length)
      parts.push(message.attachments.map((file) => `- Attachment: ${heading(file.name)}`).join('\n'));
  }
  return `${parts.join('\n\n')}\n`;
}

export function exportFilename(title: string): string {
  return `${
    title
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .slice(0, 80) || 'conversation'
  }.md`;
}
