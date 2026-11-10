import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MessageActions } from './MessageActions';
import type { Message } from '../../types/chat';
const message: Message = {
  _id: 'm1',
  senderId: 'alice',
  senderName: 'Alice',
  body: 'Hello',
  kind: 'person',
  seq: 1,
  createdAt: '2026-11-10T12:00:00Z',
  evidence: []
};
it('provides direct copy and reply, plus an accessible reaction picker', async () => {
  const copy = vi.fn(),
    reply = vi.fn(),
    react = vi.fn().mockResolvedValue(undefined);
  render(<MessageActions message={message} own userId="alice" onCopy={copy} onReply={reply} onReact={react} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(copy).toHaveBeenCalledWith('Hello');
  fireEvent.click(screen.getByRole('button', { name: 'Reply to Alice' }));
  expect(reply).toHaveBeenCalledWith(message);
  fireEvent.click(screen.getByRole('button', { name: 'React to message' }));
  fireEvent.click(screen.getByRole('button', { name: 'React ❤️' }));
  await waitFor(() => expect(react).toHaveBeenCalledWith(message, '❤️'));
});
it('requires confirmation to unsend and only offers unsend for the sender', async () => {
  const unsend = vi.fn().mockResolvedValue(undefined);
  const view = render(<MessageActions message={message} own onCopy={vi.fn()} onReply={vi.fn()} onUnsend={unsend} />);
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Unsend' }));
  expect(unsend).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Unsend' }));
  await waitFor(() => expect(unsend).toHaveBeenCalledWith(message));
  view.unmount();
  render(<MessageActions message={message} own={false} onCopy={vi.fn()} onReply={vi.fn()} onUnsend={unsend} />);
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  expect(screen.queryByRole('menuitem', { name: 'Unsend' })).not.toBeInTheDocument();
});
it('removes your existing reaction when selected again, and copies names for attachment-only messages', async () => {
  const react = vi.fn().mockResolvedValue(undefined),
    copy = vi.fn();
  const source = {
    ...message,
    body: '',
    attachments: [{ fileId: 'f1', name: 'photo.png', kind: 'image' as const, mime: 'image/png', size: 1 }],
    reactions: [{ userId: 'alice', emoji: '👍' }]
  };
  render(<MessageActions message={source} userId="alice" onCopy={copy} onReply={vi.fn()} onReact={react} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(copy).toHaveBeenCalledWith('photo.png');
  fireEvent.click(screen.getByRole('button', { name: 'React to message' }));
  fireEvent.click(screen.getByRole('button', { name: 'React 👍' }));
  await waitFor(() => expect(react).toHaveBeenCalledWith(source, null));
});
it('offers no actions for an unsent message', () => {
  render(
    <MessageActions message={{ ...message, unsentAt: '2026-11-10T12:01:00Z' }} onCopy={vi.fn()} onReply={vi.fn()} />
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
