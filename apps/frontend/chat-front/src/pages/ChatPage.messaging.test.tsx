import { state } from '../test/chatFixtures';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../services/apiClient';
import '../utils/chatContext';
import Chat from './ChatPage';
it('asks visitors to sign in without fetching private messages', async () => {
  state.authenticated = false;
  render(<Chat />);
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
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

it('sends a reply target, focuses the composer, and clears the preview after sending', async () => {
  state.messages = [
    {
      _id: 'm1',
      kind: 'person',
      senderName: 'Bob',
      body: 'A question from Bob',
      seq: 1,
      createdAt: '2026-11-04T12:00:00Z',
      evidence: []
    }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  fireEvent.click(await screen.findByRole('button', { name: 'Reply to Bob' }));
  expect(screen.getByText('Replying to Bob')).toBeInTheDocument();
  expect(screen.getByLabelText('Message')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'My answer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/conversations/c1/messages',
      expect.objectContaining({ body: 'My answer', replyTo: 'm1', clientId: expect.any(String) })
    )
  );
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull());
});

it('cancels a staged reply without discarding the draft', async () => {
  state.messages = [
    {
      _id: 'm1',
      kind: 'person',
      senderName: 'Bob',
      body: 'Original',
      seq: 1,
      createdAt: '2026-11-04T12:00:00Z',
      evidence: []
    }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  fireEvent.click(await screen.findByRole('button', { name: 'Reply to Bob' }));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Keep my draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
  expect(screen.getByLabelText('Message')).toHaveValue('Keep my draft');
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/conversations/c1/messages',
      expect.not.objectContaining({ replyTo: expect.anything() })
    )
  );
});

it('keeps the reply and retry identifier after a failed send', async () => {
  state.messages = [
    {
      _id: 'm1',
      kind: 'person',
      senderName: 'Bob',
      body: 'Original',
      seq: 1,
      createdAt: '2026-11-04T12:00:00Z',
      evidence: []
    }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  fireEvent.click(await screen.findByRole('button', { name: 'Reply to Bob' }));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Retry this reply' } });
  const send = vi.mocked(api);
  send.mockRejectedValueOnce(new Error('Connection lost'));
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByText('Connection lost')).toBeInTheDocument();
  expect(screen.getByText('Replying to Bob')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull());
  const attempts = send.mock.calls
    .filter(([path, body]) => path === '/conversations/c1/messages' && body)
    .map(([, body]) => body);
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]).toMatchObject({ replyTo: 'm1', body: 'Retry this reply' });
});

it('keeps a newly edited draft when an earlier send completes', async () => {
  let complete!: (value: unknown) => void;
  const original = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation((path, body, signal) => {
    if (path.endsWith('/messages') && body)
      return new Promise((resolve) => {
        complete = resolve;
      });
    return original(path, body, signal);
  });
  try {
    render(<Chat />);
    fireEvent.click(await screen.findByText('Research discussion'));
    const input = await screen.findByLabelText('Message');
    fireEvent.change(input, { target: { value: 'First question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(complete).toBeDefined());
    fireEvent.change(input, { target: { value: 'Next question already being drafted' } });
    await act(async () => complete({}));
    expect(input).toHaveValue('Next question already being drafted');
  } finally {
    vi.mocked(api).mockImplementation(original);
  }
});

it('shows failed invitations inside the People dialog and preserves the handle for correction', async () => {
  state.conversations[0].kind = 'room';
  const original = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation(async (path, body, signal) => {
    if (path.endsWith('/participants')) throw new Error('No public profile with that handle');
    return original(path, body, signal);
  });
  try {
    render(<Chat />);
    fireEvent.click(await screen.findByText('Research discussion'));
    fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'People' }));
    fireEvent.change(screen.getByLabelText('Public profile handle'), { target: { value: '@missing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    const dialog = screen.getByRole('dialog', { name: 'People' });
    await waitFor(() => expect(dialog).toHaveTextContent('No public profile with that handle'));
    expect(screen.getByLabelText('Public profile handle')).toHaveValue('@missing');
  } finally {
    vi.mocked(api).mockImplementation(original);
  }
});

it('shows the conversation avatar as a link to its public profile', async () => {
  state.conversations[0].profile = {
    id: 'bot',
    handle: 'vivi',
    name: 'Vivi',
    picture: 'https://example.test/avatar.png'
  };
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  const link = await screen.findByRole('link', { name: 'View Vivi profile' });
  expect(link).toHaveAttribute('href', '/u/vivi');
  expect(screen.getByRole('img', { name: 'Vivi' })).toHaveAttribute('src', 'https://example.test/avatar.png');
});

it('keeps a linked placeholder when a public profile has no avatar', async () => {
  state.conversations[0].profile = { id: 'bot', handle: 'vivi', name: 'Vivi' };
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect(await screen.findByRole('link', { name: 'View Vivi profile' })).toHaveTextContent('V');
});

it('shows the latest message preview and date in the conversation list', async () => {
  state.conversations[0].latestMessage = { body: 'Latest research update', createdAt: new Date().toISOString() };
  render(<Chat />);
  expect(await screen.findByText('Latest research update')).toBeInTheDocument();
  expect(screen.getByText('Today')).toBeInTheDocument();
});

it('opens people and permissions from the conversation settings menu', async () => {
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'People' }));
  expect(await screen.findByRole('dialog', { name: 'People' })).toBeInTheDocument();
});

it('shows approximate last activity for a human direct contact', async () => {
  state.conversations[0].kind = 'direct';
  state.conversations[0].profile = {
    id: 'bob',
    handle: 'bob',
    name: 'Bob',
    lastActiveAt: new Date(Date.now() - 10 * 60_000).toISOString()
  };
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect((await screen.findAllByText(/Last active about 10m ago/)).length).toBeGreaterThan(0);
});

it('keeps a direct conversation free of shared assistant controls and requests', async () => {
  state.enabled = true;
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect(await screen.findByText('Private conversation')).toBeInTheDocument();
  expect(screen.queryByText(/Shared assistants/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Agree to shared assistants/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: '@Vivi hello Bob' } });
  expect(screen.queryByRole('listbox', { name: 'Mention an assistant' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/conversations/c1/messages', expect.objectContaining({ body: '@Vivi hello Bob' })));
  const sent = vi.mocked(api).mock.calls.find(([path, body]) => path === '/conversations/c1/messages' && body);
  expect(sent?.[1]).not.toHaveProperty('assistantId');
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith('/assistants'))).toBe(false);
});

it('offers People in an assistant chat menu without a duplicate back action', async () => {
  state.enabled = true;
  state.conversations[0].kind = 'assistant';
  state.conversations[0].assistantId = 'vivi';
  state.conversations[0].participants = [state.conversations[0].participants[0]];
  state.conversations[0].profile = { id: 'bot', handle: 'vivi', name: 'Vivi' };
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
  expect(screen.queryByRole('menuitem', { name: 'Back to conversations' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'People' }));
  const dialog = await screen.findByRole('dialog', { name: 'People' });
  expect(within(dialog).getByText('Vivi')).toBeInTheDocument();
  expect(within(dialog).getByText('Alice')).toBeInTheDocument();
  expect(within(dialog).getByText('AI assistant')).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument();
});

it('shows your avatar in People and links it to your profile', async () => {
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'People' }));
  const dialog = await screen.findByRole('dialog', { name: 'People' });
  const link = await within(dialog).findByRole('link', { name: 'View your profile' });
  expect(link).toHaveAttribute('href', '/u/alice');
  expect(within(link).getByRole('img', { name: 'Alice' })).toHaveAttribute('src', 'https://example.test/alice.png');
});
