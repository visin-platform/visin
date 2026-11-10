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

const answer = (patch: Partial<Message> = {}): Message => ({
  _id: 'a1',
  kind: 'assistant',
  senderName: 'Visin analyst',
  body: 'Validation peaked at epoch 42.',
  seq: 3,
  createdAt: '2026-11-04T12:00:00Z',
  evidence: [],
  ...patch
});
const noop = () => undefined;
const RUN = '64b1f0c2a3b4c5d6e7f80912';

it('names the runs an answer cites, and falls back to a short id for one it cannot name', () => {
  const evidence = [
    { tool: 'get_training', input: { training: RUN }, at: '2026-11-04T12:00:00Z' },
    { tool: 'get_training', input: { training: '64b1f0c2a3b4c5d6e7f80999' }, at: '2026-11-04T12:00:01Z' }
  ];
  render(
    <MessageBubble
      message={answer({ evidence })}
      canSave={false}
      labels={[{ id: RUN, name: 'baseline-r50' }]}
      onCopy={noop}
      onReply={noop}
      onSave={noop}
    />
  );
  expect(screen.getByRole('link', { name: 'baseline-r50' })).toHaveAttribute('href', `/trainings/${RUN}`);
  expect(screen.getByRole('link', { name: 'Run f80999' })).toBeInTheDocument();
});

it('says how many sources an answer checked, and opens the list on request', () => {
  const evidence = [
    { tool: 'list_projects', input: {}, at: '2026-11-04T12:00:00Z' },
    { tool: 'get_training_curve', input: { training: RUN }, at: '2026-11-04T12:00:01Z' }
  ];
  render(<MessageBubble message={answer({ evidence })} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />);
  const toggle = screen.getByRole('button', { name: /Checked 2 sources/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Read the training curve')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Found the project')).toBeInTheDocument();
  expect(screen.getByText('Read the training curve')).toBeInTheDocument();
  expect(screen.getByText(/Sources checked/)).toBeInTheDocument();
});

it('says "source" for one, and offers nothing for an answer that checked none, or a message that is not one', () => {
  const one = [{ tool: 'get_project', input: {}, at: '2026-11-04T12:00:00Z' }];
  const { rerender } = render(
    <MessageBubble message={answer({ evidence: one })} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />
  );
  expect(screen.getByRole('button', { name: /Checked 1 source$/ })).toBeInTheDocument();
  rerender(<MessageBubble message={answer()} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />);
  expect(screen.queryByRole('button', { name: /Checked/ })).not.toBeInTheDocument();
  rerender(
    <MessageBubble
      message={answer({ kind: 'person', evidence: one })}
      canSave={false}
      onCopy={noop}
      onReply={noop}
      onSave={noop}
    />
  );
  expect(screen.queryByRole('button', { name: /Checked/ })).not.toBeInTheDocument();
});

it('shows reaction counts and lets you remove your own reaction from the chip', async () => {
  const react = vi.fn().mockResolvedValue(undefined);
  const source = answer({
    reactions: [
      { userId: 'alice', emoji: '👍' },
      { userId: 'bob', emoji: '👍' }
    ]
  });
  render(
    <MessageBubble
      message={source}
      userId="alice"
      canSave={false}
      onCopy={noop}
      onReply={noop}
      onSave={noop}
      onReact={react}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: '👍: 2 reactions, including yours' }));
  expect(react).toHaveBeenCalledWith(source, null);
});
it('never shows original text, quotes, attachment previews or actions for unsent messages', () => {
  const source = answer({
    body: 'Secret original',
    unsentAt: '2026-11-10T12:01:00Z',
    quote: { messageId: 'q1', senderName: 'Bob', kind: 'person', body: 'Secret quote' },
    reactions: [{ userId: 'alice', emoji: '👍' }]
  });
  render(<MessageBubble message={source} canSave onCopy={noop} onReply={noop} onSave={noop} />);
  expect(screen.getByText('Message unsent')).toBeInTheDocument();
  expect(screen.queryByText(/Secret/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
