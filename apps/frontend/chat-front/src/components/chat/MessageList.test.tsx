import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspaceContext } from '../../contexts/chatWorkspace';
import type { Conversation, Draft, Message, Run } from '../../types/chat';
import { MessageList } from './MessageList';

const chat = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  react: vi.fn(),
  unsend: vi.fn(),
  messages: vi.fn(async () => [])
}));
vi.mock('../../services/chatService', () => ({ chatService: chat }));

const conversation = (patch: Partial<Conversation> = {}): Conversation => ({
  _id: 'c1',
  kind: 'assistant',
  title: 'Run analysis',
  participants: [],
  trainingIds: [],
  seq: 1,
  ...patch
});
const run = (patch: Partial<Run> = {}): Run => ({
  _id: 'r1',
  messageId: 'q1',
  state: 'running',
  activity: 'Reading results and preparing an answer',
  ...patch
});
const message = (patch: Partial<Message> = {}): Message => ({
  _id: 'm1',
  kind: 'person',
  senderId: 'alice',
  senderName: 'Alice',
  body: 'Summarize this run',
  seq: 1,
  createdAt: '2026-11-10T10:00:00Z',
  evidence: [],
  ...patch
});

interface Scene {
  c?: Conversation;
  messages?: Message[];
  runs?: Run[];
  drafts?: Draft[];
}
function mount(
  { c = conversation(), messages = [message()], runs = [run()], drafts = [] }: Scene = {},
  extra: object = {}
) {
  const active = runs.some((r) => ['queued', 'running'].includes(r.state));
  const value = {
    scroller: createRef<HTMLDivElement>(),
    atBottom: { current: true },
    hasOlder: false,
    messages,
    perform: async (operation: () => Promise<void>) => operation(),
    c,
    setHasOlder: vi.fn(),
    setMessages: vi.fn(),
    setFinding: vi.fn(),
    running: active,
    selected: c._id,
    latestRun: runs[0],
    failedQuestion: undefined,
    enabled: true,
    sending: false,
    post: vi.fn(),
    ask: vi.fn(),
    setReplyTarget: vi.fn(),
    setSharedTarget: vi.fn(),
    composerInput: { current: null },
    runs,
    drafts,
    user: { id: 'alice' },
    ...extra
  };
  const wrap = (children: ReactNode) => (
    <ChatWorkspaceContext.Provider value={value as never}>{children}</ChatWorkspaceContext.Provider>
  );
  return render(wrap(<MessageList />));
}

beforeEach(() => {
  chat.cancel.mockClear();
  // Reduced motion: a draft is shown as it arrives rather than typed out.
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => vi.unstubAllGlobals());

describe('while the analyst works', () => {
  it('shows what it is doing, step by step', () => {
    mount({
      runs: [
        run({
          steps: [
            { tool: 'list_projects', startedAt: '2026-11-10T10:00:01Z', endedAt: '2026-11-10T10:00:02Z' },
            { tool: 'get_training_curve', startedAt: '2026-11-10T10:00:03Z' }
          ]
        })
      ]
    });
    expect(screen.getByText('Found the project')).toBeInTheDocument();
    expect(screen.getByText('Reading the training curve')).toBeInTheDocument();
    expect(screen.queryByTestId('streaming-message')).not.toBeInTheDocument();
  });

  it('gives way to the answer as it is written', () => {
    mount({ drafts: [{ runId: 'r1', messageId: 'q1', text: 'Validation peaked at epoch 42' }] });
    expect(screen.getByTestId('streaming-message')).toBeInTheDocument();
    expect(screen.getByText('Validation peaked at epoch 42')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'The analyst is working' })).not.toBeInTheDocument();
  });

  it('names the assistant that is writing', () => {
    mount({ runs: [run({ assistantName: 'Reviewer' })], drafts: [{ runId: 'r1', messageId: 'q1', text: 'Hello' }] });
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });
});

describe('when the answer is a message', () => {
  const answer = message({
    _id: 'a1',
    kind: 'assistant',
    senderId: 'assistant:analyst',
    senderName: 'Visin analyst',
    body: 'Validation peaked at epoch 42.',
    seq: 2,
    replyTo: 'q1'
  });

  it('shows the message and not the draft, so the text is never there twice', () => {
    mount({
      messages: [message(), answer],
      runs: [run({ state: 'completed' })],
      drafts: [{ runId: 'r1', messageId: 'q1', text: 'Validation peaked at epoch 42.' }]
    });
    expect(screen.queryByTestId('streaming-message')).not.toBeInTheDocument();
    expect(screen.getAllByText('Validation peaked at epoch 42.')).toHaveLength(1);
  });

  it('keeps showing the draft for as long as the message has not arrived, though the run is complete', () => {
    mount({
      runs: [run({ state: 'completed' })],
      drafts: [{ runId: 'r1', messageId: 'q1', text: 'The whole answer' }]
    });
    expect(screen.getByText('The whole answer')).toBeInTheDocument();
  });
});

describe('in a conversation between people', () => {
  it('never shows an assistant draft', () => {
    mount({
      c: conversation({ kind: 'direct' }),
      drafts: [{ runId: 'r1', messageId: 'q1', text: 'Not for this thread' }]
    });
    expect(screen.queryByText('Not for this thread')).not.toBeInTheDocument();
  });
});

describe('the rest of the thread', () => {
  it('says what failed, and when the thread has nothing yet offers the starters', () => {
    mount({ runs: [run({ state: 'failed', error: 'Provider unavailable' })], messages: [] });
    expect(screen.getByText('Provider unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Ask about results/)).toBeInTheDocument();
  });

  it('draws nothing without a conversation', () => {
    const { container } = mount({}, { c: undefined });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('after an answer', () => {
  const answered = [
    message({ body: 'What happened here?' }),
    message({
      _id: 'a1',
      kind: 'assistant',
      senderId: 'assistant:analyst',
      senderName: 'Visin analyst',
      body: 'Peak at 42.',
      seq: 2,
      replyTo: 'q1'
    })
  ];
  const done = [run({ state: 'completed' })];
  const group = () => screen.queryByRole('group', { name: 'Follow-up questions' });

  it('offers next questions, and asks the one that is clicked', async () => {
    const ask = vi.fn();
    mount({ c: conversation({ projectId: 'p1', trainingIds: ['t1'] }), messages: answered, runs: done }, { ask });
    expect(group()).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Summarize this run/ }));
    expect(ask).toHaveBeenCalledWith('Summarize this run');
  });

  it('does not offer what was asked in the thread', () => {
    mount({
      c: conversation({ projectId: 'p1', trainingIds: ['t1'] }),
      messages: [message({ body: 'Summarize this run' }), ...answered.slice(1)],
      runs: done
    });
    expect(screen.queryByRole('button', { name: /Summarize this run/ })).not.toBeInTheDocument();
  });

  it('waits until the analyst has finished, and until there is an answer to follow', () => {
    mount({ messages: answered, runs: [run()] });
    expect(group()).not.toBeInTheDocument();
  });

  it('is not offered after a question that has no answer yet, where the analyst is off, or between people', () => {
    const { unmount } = mount({ messages: [message()], runs: done });
    expect(group()).not.toBeInTheDocument();
    unmount();
    const off = mount({ messages: answered, runs: done }, { enabled: false });
    expect(group()).not.toBeInTheDocument();
    off.unmount();
    mount({ c: conversation({ kind: 'direct' }), messages: answered, runs: done });
    expect(group()).not.toBeInTheDocument();
  });
});

it('persists reactions and unsend, updates loaded messages, and clears a removed reply target', async () => {
  const source = message();
  const setMessages = vi.fn(),
    setReplyTarget = vi.fn();
  const reacted = { ...source, revision: 1, reactions: [{ userId: 'alice', emoji: '❤️' }] };
  const removed = { ...source, revision: 2, unsentAt: '2026-11-10T12:01:00Z', body: '', reactions: [] };
  chat.react.mockResolvedValueOnce(reacted);
  chat.unsend.mockResolvedValueOnce(removed);
  mount(
    { c: conversation({ kind: 'direct' }), runs: [], messages: [source] },
    { setMessages, setReplyTarget, replyTarget: source }
  );
  fireEvent.click(screen.getByRole('button', { name: 'React to message' }));
  fireEvent.click(screen.getByRole('button', { name: 'React ❤️' }));
  await waitFor(() => expect(chat.react).toHaveBeenCalledWith('c1', 'm1', '❤️'));
  await waitFor(() => expect(setMessages).toHaveBeenCalled());
  expect(setMessages.mock.calls[0][0]([source])[0].reactions).toEqual(reacted.reactions);
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Unsend' }));
  fireEvent.click(screen.getByRole('button', { name: 'Unsend' }));
  await waitFor(() => expect(chat.unsend).toHaveBeenCalledWith('c1', 'm1'));
  await waitFor(() => expect(setReplyTarget).toHaveBeenCalledWith(undefined));
  expect(setMessages.mock.calls.at(-1)![0]([source])[0].body).toBe('');
});

it('clears the composer reply target when a remotely unsent message arrives', () => {
  const setReplyTarget = vi.fn();
  mount(
    { messages: [message({ unsentAt: '2026-11-10T12:01:00Z', body: '' })], runs: [] },
    { setReplyTarget, replyTarget: message() }
  );
  expect(setReplyTarget).toHaveBeenCalledWith(undefined);
});

it('offers selectable text when browser clipboard access is unavailable', async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
  });
  try {
    mount({ runs: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const input = await screen.findByRole('textbox', { name: 'Message text' });
    expect(input).toHaveValue('Summarize this run');
    fireEvent.focus(input);
    expect((input as HTMLTextAreaElement).selectionEnd).toBe('Summarize this run'.length);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  } finally {
    if (previous) Object.defineProperty(navigator, 'clipboard', previous);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});
