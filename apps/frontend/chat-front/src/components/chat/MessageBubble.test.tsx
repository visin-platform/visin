import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS } from '../../hooks/useLongPress';
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
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
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

it('folds the thinking above an answer: its notes and its reads, in the order they happened', () => {
  const evidence = [
    { tool: 'list_projects', input: {}, at: '2026-11-04T12:00:00Z' },
    { tool: 'get_training_curve', input: { training: RUN }, at: '2026-11-04T12:00:05Z' }
  ];
  const thoughts = [{ text: 'Now the curve, to see where validation peaked.', at: '2026-11-04T12:00:05Z' }];
  render(
    <MessageBubble message={answer({ evidence, thoughts })} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />
  );
  const toggle = screen.getByRole('button', { name: /Thinking · 2 sources/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Read the training curve')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const lines = screen.getAllByRole('listitem').map((item) => item.textContent);
  // A note made at the same moment as a read comes before it: it says why the read was made.
  expect(lines).toEqual(['Found the project', 'Now the curve, to see where validation peaked.', 'Read the training curve']);
  expect(screen.getByText(/Sources checked/)).toBeInTheDocument();
});

it('says "source" for one, shows thinking with no reads, and folds nothing for an answer with neither', () => {
  const one = [{ tool: 'get_project', input: {}, at: '2026-11-04T12:00:00Z' }];
  const { rerender } = render(
    <MessageBubble message={answer({ evidence: one })} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />
  );
  expect(screen.getByRole('button', { name: /Thinking · 1 source$/ })).toBeInTheDocument();
  rerender(
    <MessageBubble
      message={answer({ thoughts: [{ text: 'A general question.', at: '2026-11-04T12:00:00Z' }] })}
      canSave={false}
      onCopy={noop}
      onReply={noop}
      onSave={noop}
    />
  );
  expect(screen.getByRole('button', { name: /^Thinking$/ })).toBeInTheDocument();
  rerender(<MessageBubble message={answer()} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />);
  expect(screen.queryByRole('button', { name: /Thinking/ })).not.toBeInTheDocument();
  rerender(
    <MessageBubble
      message={answer({ kind: 'person', evidence: one })}
      canSave={false}
      onCopy={noop}
      onReply={noop}
      onSave={noop}
    />
  );
  expect(screen.queryByRole('button', { name: /Thinking/ })).not.toBeInTheDocument();
});

it('shows reaction counts on a person\'s message, and lets you remove your own reaction from the chip', async () => {
  const react = vi.fn().mockResolvedValue(undefined);
  const source = person({
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
it('shows no reactions, and offers none, on an assistant\'s answer', () => {
  const source = answer({ reactions: [{ userId: 'alice', emoji: '👍' }, { userId: 'bob', emoji: '🔥' }] });
  render(
    <MessageBubble message={source} userId="alice" canSave={false} onCopy={noop} onReply={noop} onSave={noop} onReact={vi.fn()} />
  );
  expect(screen.queryByLabelText('Message reaction counts')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'React to message' })).not.toBeInTheDocument();
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

afterEach(() => vi.useRealTimers());

const person = (patch: Partial<Message> = {}): Message => ({
  _id: 'p1',
  kind: 'person',
  senderName: 'Bob',
  body: 'Run 7 looks off',
  seq: 1,
  createdAt: '2026-11-04T12:00:00Z',
  evidence: [],
  ...patch
});

it('names the sender only at the start of a run and times it only at the end', () => {
  const view = render(<MessageBubble message={person()} first last={false} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />);
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(view.container.querySelector('time')).toBeNull();
  view.unmount();
  const middle = render(<MessageBubble message={person()} first={false} last canSave={false} onCopy={noop} onReply={noop} onSave={noop} />);
  expect(screen.queryByText('Bob')).toBeNull();
  expect(middle.container.querySelector('time')).toHaveAttribute('dateTime', '2026-11-04T12:00:00Z');
});

it('shows a notice as one quiet line with its time, and no actions', () => {
  render(<MessageBubble message={person({ kind: 'system', body: 'Alice joined' })} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />);
  expect(screen.getByText(/Alice joined/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

it('notes an answer that was saved as a finding beside its time', () => {
  render(<MessageBubble message={answer({ findingId: 'f1' })} last={false} canSave onCopy={noop} onReply={noop} onSave={noop} />);
  expect(screen.getByText(/Saved as finding/, { selector: 'span' })).toBeInTheDocument();
});

it('opens the message menu on a long press with a finger, and swallows the click that ends it', () => {
  vi.useFakeTimers();
  const { container } = render(<MessageBubble message={person()} canSave={false} onCopy={noop} onReply={noop} onSave={noop} />);
  const bubble = screen.getByText('Run 7 looks off').parentElement!;
  fireEvent.pointerDown(bubble, { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 10, clientY: 10 });
  fireEvent.pointerMove(bubble, { clientX: 10, clientY: 40 });
  act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 10, clientY: 10 });
  act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
  expect(screen.getByRole('menu')).toBeInTheDocument();
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  bubble.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  bubble.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(true);
  expect(container).toBeTruthy();
});
