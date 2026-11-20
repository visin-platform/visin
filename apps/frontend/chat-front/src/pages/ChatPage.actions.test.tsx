import { analysisOf, dm, state } from '../test/chatFixtures';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api, apiDelete, apiSend } from '../services/apiClient';
import type { Message } from '../types/chat';
import Chat from './ChatPage';

const row = async (title: string) => (await screen.findByText(title)).closest('li') as HTMLElement;

it('puts a conversation away without asking, and offers it back', async () => {
  render(<Chat />);
  fireEvent.click(
    within(await row('Research discussion')).getByRole('button', { name: 'Options for Research discussion' })
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Hide' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/conversations/c1/hide', {}));
  expect(await screen.findByText('Research discussion hidden')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/conversations/c1/hide', {}));
});

it('lists what was put away apart, and puts it back from there', async () => {
  state.hidden = [{ ...dm(), _id: 'h1', title: 'Old room' }];
  render(<Chat />);
  expect(await screen.findByRole('button', { name: 'Hidden (1)' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Old room')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Hidden (1)' }));
  expect(await screen.findByText('Old room')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unhide' }));
  await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/conversations/h1/hide', {}));
});

it('shows no Hidden row when nothing is put away', async () => {
  render(<Chat />);
  await screen.findByText('Research discussion');
  expect(screen.queryByRole('button', { name: /Hidden/ })).toBeNull();
});

it('leaves a conversation with people from its menu, and cannot delete it', async () => {
  render(<Chat />);
  fireEvent.click(
    within(await row('Research discussion')).getByRole('button', { name: 'Options for Research discussion' })
  );
  expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Leave' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/conversations/c1/membership', { action: 'leave' }));
});

it('deletes the chat with the assistant only after asking, and only when it is the person’s own', async () => {
  state.conversations = [dm(), analysisOf()];
  render(<Chat />);
  fireEvent.click(within(await row('Vivi')).getByRole('button', { name: 'Options for Vivi' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(await screen.findByText(/You won’t be able to open it again/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(apiDelete).not.toHaveBeenCalled();

  fireEvent.click(within(await row('Vivi')).getByRole('button', { name: 'Options for Vivi' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/conversations/a1', {}));
});

it('does not offer someone else’s chat with an assistant for deletion', async () => {
  state.conversations = [analysisOf({ createdBy: 'bob' })];
  render(<Chat />);
  fireEvent.click(within(await row('Vivi')).getByRole('button', { name: 'Options for Vivi' }));
  expect(screen.getByRole('menuitem', { name: 'Hide' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
});

it('starts a new topic from the chat’s own menu, and shows the line it leaves', async () => {
  state.enabled = true;
  state.conversations = [analysisOf()];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Vivi'));
  fireEvent.click(await screen.findByRole('button', { name: 'Conversation settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /^New topic/ }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/conversations/a1/topic', {}));
});

it('says what a question was about only where it differs from the one before', async () => {
  state.enabled = true;
  state.conversations = [analysisOf()];
  const asked = (id: string, seq: number, context?: Message['context']): Message => ({
    _id: id,
    kind: 'person',
    senderId: 'alice',
    senderName: 'Alice',
    body: `Question ${id}`,
    seq,
    createdAt: '2026-11-02T12:00:00Z',
    evidence: [],
    context
  });
  const iseauto = { projectId: 'p1', projectName: 'IseAuto', trainingIds: [] };
  const lab = { projectId: 'p2', projectName: 'Lab', trainingIds: [] };
  state.messages = [asked('q1', 1, iseauto), asked('q2', 2, iseauto), asked('q3', 3), asked('q4', 4, lab)];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Vivi'));
  await screen.findByText('Question q1');
  // The first, and the one that moved to another project. A general question names nothing.
  expect(screen.getAllByTestId('asked-about').map((node) => node.textContent)).toEqual(['IseAuto', 'Lab']);
});

it('forgets a chat that was put away, so a reload does not open it again', async () => {
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  await screen.findByLabelText('Message');
  expect(sessionStorage.getItem('visin.chat.selected.alice')).toBe('c1');
  fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Hide' }));
  await waitFor(() => expect(sessionStorage.getItem('visin.chat.selected.alice')).toBeNull());
});

it('offers Unhide, not Hide, in the menu of a chat that is hidden', async () => {
  state.hidden = [{ ...dm(), _id: 'h1', title: 'Old room' }];
  render(<Chat />);
  fireEvent.click(await screen.findByRole('button', { name: 'Hidden (1)' }));
  fireEvent.click(await screen.findByText('Old room'));
  fireEvent.click(await screen.findByRole('button', { name: 'Conversation settings' }));
  expect(screen.queryByRole('menuitem', { name: 'Hide' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Unhide' }));
  await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/conversations/h1/hide', {}));
});

describe('editing the last question', () => {
  const person = (id: string, seq: number, extra: Partial<Message> = {}): Message => ({
    _id: id,
    kind: 'person',
    senderId: 'alice',
    senderName: 'Alice',
    body: `Question ${id}`,
    seq,
    createdAt: '2026-11-02T12:00:00Z',
    evidence: [],
    ...extra
  });
  const answer = (id: string, replyTo: string, seq: number, extra: Partial<Message> = {}): Message => ({
    _id: id,
    kind: 'assistant',
    senderId: 'assistant:analyst',
    senderName: 'Vivi',
    body: `Answer to ${replyTo}`,
    seq,
    replyTo,
    createdAt: '2026-11-02T12:00:00Z',
    evidence: [],
    ...extra
  });
  const open = async () => {
    state.enabled = true;
    state.conversations = [analysisOf()];
    render(<Chat />);
    fireEvent.click(await screen.findByText('Vivi'));
  };
  const pencils = () => screen.queryAllByRole('button', { name: 'Edit question' });

  it('offers the pencil on the latest question only, never on an answer or a question with files', async () => {
    state.messages = [person('q1', 1), answer('ans1', 'q1', 2), person('q2', 3), answer('ans2', 'q2', 4)];
    await open();
    await screen.findByText('Question q2');
    expect(pencils()).toHaveLength(1);
    // The one beside the latest question: the earlier one has none, nor has Vivi's answer.
    const bubble = screen.getByText('Question q2').closest('.chat-message') as HTMLElement;
    expect(within(bubble).getByRole('button', { name: 'Edit question' })).toBeInTheDocument();
  });

  it('does not offer it on a question with files', async () => {
    state.messages = [
      person('q3', 1, { attachments: [{ fileId: 'f', name: 'a.png', kind: 'image', mime: 'image/png', size: 1 }] })
    ];
    await open();
    await screen.findByText('Question q3');
    expect(pencils()).toHaveLength(0);
  });

  it('puts the question in the box, asks again through the edit endpoint, and says what it replaces', async () => {
    state.messages = [person('q1', 1, { context: { projectId: 'p1', trainingIds: [] } }), answer('ans1', 'q1', 2)];
    await open();
    await screen.findByText('Question q1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
    expect(await screen.findByText('Editing your question')).toBeInTheDocument();
    const box = screen.getByLabelText('Ask a follow-up');
    expect(box).toHaveValue('Question q1');

    fireEvent.change(box, { target: { value: 'Question q1, on night scenes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/conversations/a1/messages/q1/edit'.replace('ans1', 'c1').replace('c1', 'ans1'),
        expect.objectContaining({ body: 'Question q1, on night scenes', context: { projectId: 'p1' } })
      )
    );
    await waitFor(() => expect(screen.queryByText('Editing your question')).toBeNull());
    expect(api).not.toHaveBeenCalledWith(
      '/conversations/a1/messages',
      expect.objectContaining({ body: 'Question q1, on night scenes' })
    );
  });

  it('can be cancelled, which empties the box and sends nothing', async () => {
    state.messages = [person('q1', 1)];
    await open();
    await screen.findByText('Question q1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel edit' }));
    expect(screen.queryByText('Editing your question')).toBeNull();
    expect(screen.getByLabelText('Ask a follow-up')).toHaveValue('');
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining('/edit'), expect.anything());
  });

  it('hides a retired question and its answer instead of showing them as unsent', async () => {
    state.messages = [
      person('q1', 1, { body: '', unsentAt: '2026-11-02T12:01:00Z', supersededAt: '2026-11-02T12:01:00Z' }),
      answer('ans1', 'q1', 2, { body: '', unsentAt: '2026-11-02T12:01:00Z', supersededAt: '2026-11-02T12:01:00Z' }),
      person('q2', 3, { body: 'Reworded question' })
    ];
    await open();
    await screen.findByText('Reworded question');
    expect(screen.queryByText('Message unsent')).toBeNull();
    expect(screen.queryByText('You unsent a message')).toBeNull();
  });
});
