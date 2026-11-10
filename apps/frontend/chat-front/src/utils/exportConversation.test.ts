import { beforeEach, expect, it, vi } from 'vitest';
import { chatService } from '../services/chatService';
import type { Message } from '../types/chat';
import { conversationMarkdown, exportFilename, exportHistory } from './exportConversation';
vi.mock('../services/chatService', () => ({ chatService: { messages: vi.fn() } }));
const message = (seq: number, patch: Partial<Message> = {}): Message => ({
  _id: `m${seq}`,
  seq,
  kind: 'person',
  senderName: 'Alice',
  body: 'Hello',
  createdAt: '2026-11-10T10:00:00Z',
  evidence: [],
  ...patch
});
beforeEach(() => vi.mocked(chatService.messages).mockReset());
it('exports older pages in chronological order and ignores messages added after the first page', async () => {
  vi.mocked(chatService.messages)
    .mockResolvedValueOnce([message(3), message(4)])
    .mockResolvedValueOnce([message(1), message(2)])
    .mockResolvedValueOnce([]);
  const signal = new AbortController().signal;
  expect((await exportHistory('c', signal)).map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  expect(chatService.messages).toHaveBeenNthCalledWith(1, 'c', signal, undefined);
  expect(chatService.messages).toHaveBeenNthCalledWith(2, 'c', signal, 3);
  expect(chatService.messages).toHaveBeenNthCalledWith(3, 'c', signal, 1);
});
it('fails instead of looping forever if the history cursor does not move', async () => {
  vi.mocked(chatService.messages).mockResolvedValue([message(3)]);
  await expect(exportHistory('c', new AbortController().signal)).rejects.toThrow('Could not load older messages');
});
it('cancels without reading any messages after closing the dialog', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(exportHistory('c', controller.signal)).rejects.toThrow();
  expect(chatService.messages).not.toHaveBeenCalled();
});
it('preserves code and reply Markdown while redacting unsent content and excluding file URLs and tools', () => {
  const result = conversationMarkdown('Research\n# Notes', [
    message(1, {
      body: '```python\nprint("hi")\n```',
      quote: { messageId: 'source', senderName: 'Bob', body: 'First\nSecond', kind: 'person' },
      attachments: [{ fileId: 'secret-file-path', name: '[image].png', mime: 'image/png', kind: 'image', size: 3 }],
      evidence: [{ tool: 'private-tool', input: { secret: 'hidden' }, at: '' }]
    }),
    message(2, {
      body: 'removed secret',
      unsentAt: 'now',
      attachments: [{ fileId: 'removed', name: 'removed.txt', mime: 'text/plain', kind: 'file', size: 2 }]
    }),
    message(3, {
      quote: { messageId: 'source', senderName: 'Bob', body: 'removed quote', kind: 'person', unsent: true }
    })
  ]);
  expect(result).toContain('# Research \\# Notes');
  expect(result).toContain('2026-11-10T10:00:00.000Z');
  expect(result).toContain('```python\nprint("hi")\n```');
  expect(result).toContain('> First\n> Second');
  expect(result).toContain('Attachment: \\[image\\].png');
  expect(result).toContain('Message unsent');
  for (const secret of ['secret-file-path', 'private-tool', 'hidden', 'removed secret', 'removed.txt', 'removed quote'])
    expect(result).not.toContain(secret);
  expect(exportFilename('../Notes: Tallinn?')).toBe('Notes Tallinn.md');
  expect(exportFilename('???')).toBe('conversation.md');
});
