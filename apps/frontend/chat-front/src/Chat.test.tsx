import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Message, Run } from './api';
import './chatContext';
const state = vi.hoisted(() => ({
  authenticated: true,
  enabled: false,
  admin: false,
  accountUrl: undefined as string | undefined,
  conversations: [] as Conversation[],
  messages: [] as Message[],
  runs: [] as Run[]
}));
vi.mock('./auth', () => ({
  useAuth: () => ({ user: { id: 'alice' }, isAuthenticated: state.authenticated, isLoading: false, login: vi.fn() })
}));
vi.mock('./config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ CHAT_SERVICE_URL: 'http://chat.test', ACCOUNT_FRONT_URL: state.accountUrl })
}));
vi.mock('./api', () => ({
  api: vi.fn(async (path: string, body?: unknown) => {
    if (path === '/conversations' && body) return { ...state.conversations[0], _id: 'created' };
    if (path === '/conversations') return state.conversations;
    if (path === '/capabilities') return { assistant: state.enabled, canConfigure: state.admin };
    if (path.endsWith('/runs')) return state.runs;
    if (path === '/groups') return [];
    if (path === '/projects') return [{ _id: 'p1', name: 'Road scene experiments' }];
    if (path.endsWith('/messages') && body) return {};
    if (path.endsWith('/messages')) return state.messages;
    return {};
  })
}));
import Chat from './Chat';
import { api } from './api';
const dm = (): Conversation => ({
  _id: 'c1',
  title: 'Research discussion',
  kind: 'direct',
  participants: [
    { userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 },
    { userId: 'bob', name: 'Bob', state: 'active', role: 'member', readSeq: 0 }
  ],
  seq: 0,
  trainingIds: []
});
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  state.authenticated = true;
  state.enabled = false;
  state.admin = false;
  state.accountUrl = undefined;
  state.conversations = [dm()];
  state.messages = [];
  state.runs = [];
  delete window.__visinChatContext;
  delete window.__visinPageContext;
});
describe('Chat', () => {
  it('asks visitors to sign in without fetching private messages', async () => {
    state.authenticated = false;
    render(<Chat />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
  it('supports human conversation when assistants are unavailable', async () => {
    render(<Chat />);
    fireEvent.click(await screen.findByText('Research discussion'));
    expect(await screen.findByLabelText('Message')).toBeInTheDocument();
    expect(screen.queryByText(/Private analysis/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Compare these experiments?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/conversations/c1/messages',
        expect.objectContaining({ body: 'Compare these experiments?', clientId: expect.any(String) })
      )
    );
  });
  it('shows accept and decline on an invitation and disables sending', async () => {
    state.conversations[0].participants[0].state = 'invited';
    render(<Chat />);
    fireEvent.click(await screen.findByText('Research discussion'));
    expect(await screen.findByText('You have a conversation request.')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/conversations/c1/membership', { action: 'accept' }));
  });
  it('opens a ready analysis of the run on a deliberate open, without creating anything yet', async () => {
    render(<Chat panel />);
    await screen.findByText('Research discussion');
    window.dispatchEvent(
      new CustomEvent('visin:chat-context', {
        detail: { title: 'Analyze base model', projectId: 'p1', trainingIds: ['t1'] }
      })
    );
    expect(await screen.findByRole('link', { name: 'Analyze base model' })).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getByText('New analysis · only you can read it')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summarize this run' })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith('/conversations', expect.objectContaining({ kind: 'assistant' }));
  });
  it('disables private assistant sends when the provider is unconfigured', async () => {
    state.conversations[0].kind = 'assistant';
    render(<Chat />);
    fireEvent.click(await screen.findByText('Research discussion'));
    expect(
      await screen.findByText('The analyst is not turned on for this deployment. Ask an administrator.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ask a follow-up')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Set up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Analyst settings' })).toBeNull();
  });
  it('keeps human message contents as text', async () => {
    state.messages = [
      {
        _id: 'm1',
        kind: 'person',
        senderName: 'Bob',
        body: '<script>alert(1)</script>',
        seq: 1,
        createdAt: '2026-11-02T12:00:00Z',
        evidence: []
      }
    ];
    render(<Chat />);
    fireEvent.click(await screen.findByText('Research discussion'));
    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});

it('shows measured evidence and submits a reviewed finding through the separate save action', async () => {
  const training = '111111111111111111111111';
  state.enabled = true;
  state.conversations[0].kind = 'assistant';
  state.conversations[0].projectId = 'project1';
  state.conversations[0].trainingIds = [training];
  state.conversations[0].trainingLabels = [{ id: training, name: 'Base model' }];
  state.messages = [
    {
      _id: 'answer1',
      kind: 'assistant',
      senderName: 'Visin analyst',
      body: 'Validation peaked at epoch 42.',
      seq: 1,
      createdAt: '2026-11-02T12:00:00Z',
      evidence: [
        { tool: 'get_training', input: { training, trainings: [training, 'not-an-id'] }, at: '2026-11-02T12:00:00Z' }
      ]
    }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect(await screen.findByText('Validation peaked at epoch 42.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Base model' })).toHaveAttribute('href', `/trainings/${training}`);
  expect(screen.getByRole('link', { name: 'Evidence · 111111' })).toHaveAttribute('href', `/trainings/${training}`);
  expect(screen.queryByRole('link', { name: /not-an-id/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save as finding' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Validation peak' } });
  fireEvent.change(screen.getByLabelText('Suggested next experiment (optional)'), {
    target: { value: 'Try earlier stopping' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save finding' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/conversations/c1/findings', {
      messageId: 'answer1',
      title: 'Validation peak',
      body: 'Validation peaked at epoch 42.',
      recommendations: 'Try earlier stopping'
    })
  );
});
it('lets users stop a durable analysis job', async () => {
  state.conversations[0].kind = 'assistant';
  state.enabled = true;
  state.runs = [{ _id: 'job1', state: 'running', activity: 'Reading epochs' }];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect(await screen.findByText('Reading epochs')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Stop analysis' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/conversations/c1/cancel', {}));
});
it('offers to retry the question behind a failed analysis, and only while it is the latest run', async () => {
  state.conversations[0].kind = 'assistant';
  state.enabled = true;
  state.messages = [
    {
      _id: 'q1',
      kind: 'person',
      senderName: 'Alice',
      body: 'Where did it peak?',
      seq: 1,
      createdAt: '2026-11-02T12:00:00Z',
      evidence: []
    }
  ];
  state.runs = [{ _id: 'job1', messageId: 'q1', state: 'failed', activity: 'Failed', error: 'Provider unavailable' }];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect(await screen.findByText('Provider unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/conversations/c1/messages',
      expect.objectContaining({ body: 'Where did it peak?', clientId: expect.any(String) })
    )
  );
});
it('hides an old failure once a later question was answered', async () => {
  state.conversations[0].kind = 'assistant';
  state.enabled = true;
  state.runs = [
    { _id: 'job2', messageId: 'q2', state: 'completed', activity: 'Completed' },
    { _id: 'job1', messageId: 'q1', state: 'failed', activity: 'Failed', error: 'Provider unavailable' }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  await screen.findByText('Ask about results, validation peaks or your next experiment.');
  expect(screen.queryByText('Provider unavailable')).toBeNull();
});
it('sends with Enter, keeps Shift+Enter for a new line, and marks the thread read once', async () => {
  state.messages = [
    {
      _id: 'm1',
      kind: 'person',
      senderName: 'Bob',
      body: 'Hello',
      seq: 3,
      createdAt: '2026-11-02T12:00:00Z',
      evidence: []
    }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  await screen.findByText('Hello');
  await waitFor(() => expect(api).toHaveBeenCalledWith('/conversations/c1/read', { seq: 3 }));
  const input = screen.getByLabelText('Message');
  fireEvent.change(input, { target: { value: 'Reply' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(api).not.toHaveBeenCalledWith('/conversations/c1/messages', expect.anything());
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/conversations/c1/messages', expect.objectContaining({ body: 'Reply' }))
  );
  expect(
    (api as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => c[0] === '/conversations/c1/read')
  ).toHaveLength(1);
});
it('shows an unread count for other conversations', async () => {
  state.conversations = [{ ...dm(), _id: 'c2', title: 'Busy room', seq: 4, lastMessageSeq: 4 }];
  render(<Chat />);
  expect(await screen.findByLabelText('4 unread')).toBeInTheDocument();
});

const analysisOf = (overrides: Partial<Conversation> = {}): Conversation => ({
  ...dm(),
  _id: 'a1',
  kind: 'assistant',
  title: 'Base model analysis',
  projectId: 'p1',
  trainingIds: ['t1'],
  participants: [{ userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 }],
  ...overrides
});
const showPage = (detail: unknown) =>
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:page-context', { detail }));
  });
describe('following the page', () => {
  it('brings up the analysis of the run being viewed, and the existing thread when there is one', async () => {
    state.enabled = true;
    state.conversations = [dm(), analysisOf()];
    render(<Chat panel />);
    await screen.findByText('Research discussion');
    showPage({ projectId: 'p1', trainingIds: ['t1'], title: 'Base model' });
    expect(await screen.findByText('Private analysis · only you can read it')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Run t1' })).toHaveAttribute('href', '/trainings/t1');
    showPage({ projectId: 'p1', trainingIds: ['t2'], title: 'Second run' });
    expect(await screen.findByRole('link', { name: 'Second run' })).toHaveAttribute('href', '/trainings/t2');
    expect(screen.getByText('New analysis · only you can read it')).toBeInTheDocument();
  });
  it('never switches away from a conversation with people', async () => {
    state.enabled = true;
    render(<Chat panel />);
    fireEvent.click(await screen.findByText('Research discussion'));
    await screen.findByLabelText('Message');
    showPage({ projectId: 'p1', trainingIds: ['t1'], title: 'Base model' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.queryByText('New analysis · only you can read it')).toBeNull();
  });
  it('makes the analysis a conversation with its first question', async () => {
    state.enabled = true;
    render(<Chat panel />);
    await screen.findByText('Research discussion');
    showPage({ projectId: 'p1', trainingIds: ['t1'], title: 'Base model' });
    fireEvent.click(await screen.findByRole('button', { name: 'Summarize this run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/conversations', {
        kind: 'assistant',
        title: 'Base model',
        projectId: 'p1',
        trainingIds: ['t1']
      })
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/conversations/created/messages',
        expect.objectContaining({ body: 'Summarize this run' })
      )
    );
  });
});
describe('opening from a profile', () => {
  it('starts a direct message with a person', async () => {
    render(<Chat panel />);
    await screen.findByText('Research discussion');
    act(() => {
      window.dispatchEvent(
        new CustomEvent('visin:chat-context', { detail: { kind: 'direct', handle: 'grace', name: 'Grace' } })
      );
    });
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/conversations', {
        kind: 'direct',
        title: 'Grace',
        handles: ['grace'],
        userIds: []
      })
    );
  });
  it("opens a group's channel", async () => {
    window.__visinChatContext = { kind: 'group', groupId: 'g1', title: 'Lab' };
    render(<Chat panel />);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/groups/g1/channel', {}));
  });
});
it('offers the analyst, a person and a room on the new chat screen', async () => {
  state.enabled = true;
  render(<Chat panel />);
  fireEvent.click(await screen.findByRole('button', { name: 'New chat' }));
  expect(screen.getByRole('region', { name: 'Ask the analyst' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Start a room' })).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Road scene experiments'));
  expect(await screen.findByText('New analysis · only you can read it')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation list' }));
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  fireEvent.change(screen.getByLabelText('Profile handle'), { target: { value: '@ada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Message' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/conversations', expect.objectContaining({ kind: 'direct', handles: ['ada'] }))
  );
});

describe('setting up the analyst', () => {
  beforeEach(() => {
    state.conversations[0].kind = 'assistant';
    state.admin = true;
  });
  const settingsLink = () => screen.findByRole('link', { name: 'Analyst settings' });

  it("sends an administrator to Account's Analyst section, from the list, the notice and the new chat screen", async () => {
    render(<Chat panel />);
    // Inside neither the shell nor a configured account address, the path is the one the shell serves.
    expect(await settingsLink()).toHaveAttribute('href', '/account/analyst');
    fireEvent.click(await screen.findByText('Research discussion'));
    expect(await screen.findByText('The analyst is not turned on yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up' })).toHaveAttribute('href', '/account/analyst');
    fireEvent.click(screen.getByRole('button', { name: 'Conversation list' }));
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(await screen.findByRole('link', { name: 'Set up the analyst' })).toHaveAttribute('href', '/account/analyst');
  });

  it('stays on the same origin inside the shell, and names the account app outside it', async () => {
    const shell = document.createElement('div');
    shell.id = 'shell-root';
    document.body.appendChild(shell);
    const inside = render(<Chat panel />);
    expect(await settingsLink()).toHaveAttribute('href', '/account/analyst');
    inside.unmount();
    shell.remove();

    state.accountUrl = 'https://account.example.test/';
    render(<Chat panel />);
    expect(await settingsLink()).toHaveAttribute('href', 'https://account.example.test/account/analyst');
  });

  it('shows nobody else a link, only that an administrator can turn it on', async () => {
    state.admin = false;
    render(<Chat panel />);
    fireEvent.click(await screen.findByText('Research discussion'));
    expect(
      await screen.findByText('The analyst is not turned on for this deployment. Ask an administrator.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Set up' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Analyst settings' })).toBeNull();
  });
});

describe('when an administrator changes the analyst', () => {
  it('offers it as soon as Account says it was saved, without a reload', async () => {
    state.conversations[0].kind = 'assistant';
    render(<Chat panel />);
    fireEvent.click(await screen.findByText('Research discussion'));
    expect(await screen.findByLabelText('Ask a follow-up')).toBeDisabled();
    state.enabled = true;
    act(() => {
      window.dispatchEvent(new CustomEvent('visin:analyst-settings-changed'));
    });
    await waitFor(() => expect(screen.getByLabelText('Ask a follow-up')).toBeEnabled());
  });

  it('reads it again when the page comes back into view, and not while it is hidden', async () => {
    render(<Chat panel />);
    await screen.findByText('Research discussion');
    const reads = () =>
      (api as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => c[0] === '/capabilities').length;
    const before = reads();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(reads()).toBe(before);
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(reads()).toBe(before + 1));
    visibility.mockRestore();
  });
});

it.each(['direct', 'group', 'room'] as const)(
  'shows no stray count under a %s conversation, which has no project or runs',
  async (kind) => {
    state.conversations[0].kind = kind;
    render(<Chat panel />);
    fireEvent.click(await screen.findByText('Research discussion'));
    await screen.findByLabelText('Message');
    // A bare text node: getByText cannot see one that sits among sibling elements.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const stray: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      if (node.textContent?.trim() === '0') stray.push(node.textContent);
    expect(stray).toEqual([]);
    expect(screen.queryByRole('link', { name: /Project|Run/ })).toBeNull();
  }
);
