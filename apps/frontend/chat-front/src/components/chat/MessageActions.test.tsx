import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
it('offers reply and react beside a person’s message, copy in the menu, plus an accessible reaction picker', async () => {
  const copy = vi.fn(),
    reply = vi.fn(),
    react = vi.fn().mockResolvedValue(undefined);
  render(<MessageActions message={message} own userId="alice" onCopy={copy} onReply={reply} onReact={react} />);
  expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy file names' }));
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

it('treats an answer like any message beside it, and keeps copy and save in its menu', async () => {
  const answer: Message = { ...message, _id: 'a1', kind: 'assistant', senderName: 'Vivi', body: 'Peak at 42.' };
  const copy = vi.fn(),
    save = vi.fn(),
    reply = vi.fn(),
    select = vi.fn();
  const view = render(
    <MessageActions message={answer} onCopy={copy} onReply={reply} onSave={save} onSelectText={select} />
  );
  expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save as finding' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reply to Vivi' }));
  expect(reply).toHaveBeenCalledWith(answer);
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
  expect(copy).toHaveBeenCalledWith('Peak at 42.');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save as finding' }));
  expect(save).toHaveBeenCalledWith(answer);
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Select text' }));
  expect(select).toHaveBeenCalledWith('Peak at 42.');
  view.unmount();
  render(<MessageActions message={{ ...answer, findingId: 'f1' }} onCopy={copy} onReply={reply} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  expect(screen.getByRole('menuitem', { name: 'Saved as finding' })).toHaveAttribute('aria-disabled', 'true');
});

it('reacts from the menu’s quick row, and offers nothing for a notice', async () => {
  const react = vi.fn().mockResolvedValue(undefined);
  const view = render(<MessageActions message={message} userId="bob" onCopy={vi.fn()} onReply={vi.fn()} onReact={react} />);
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Quick reactions' })).getByRole('button', { name: 'React 🔥' }));
  await waitFor(() => expect(react).toHaveBeenCalledWith(message, '🔥'));
  view.unmount();
  render(<MessageActions message={{ ...message, kind: 'system' }} onCopy={vi.fn()} onReply={vi.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();
});
