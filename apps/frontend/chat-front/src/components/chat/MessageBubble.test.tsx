import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Message } from '../../types/chat';
import { MessageBubble } from './MessageBubble';

it('offers copy and reply for human messages and renders quote snapshots as text', () => {
  const message: Message = {
    _id: 'reply',
    kind: 'person',
    senderName: 'Bob',
    body: 'Human reply',
    seq: 2,
    createdAt: '2026-11-04T12:00:00Z',
    evidence: [],
    quote: { messageId: 'source', kind: 'person', senderName: 'Alice', body: '<script>untrusted quote</script>' }
  };
  const copy = vi.fn(),
    reply = vi.fn(),
    save = vi.fn();
  const { container } = render(<MessageBubble message={message} canSave onCopy={copy} onReply={reply} onSave={save} />);
  const quote = container.querySelector('blockquote')!;
  expect(within(quote).getByText('<script>untrusted quote</script>')).toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(copy).toHaveBeenCalledWith('Human reply');
  fireEvent.click(screen.getByRole('button', { name: 'Reply to Bob' }));
  expect(reply).toHaveBeenCalledWith(message);
  expect(screen.queryByRole('button', { name: 'Save as finding' })).toBeNull();
});
