import { analysisOf, dm, state } from '../test/chatFixtures';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { api, apiDelete, apiSend } from '../services/apiClient';
import type { Message } from '../types/chat';
import Chat from './ChatPage';

const row = async (title: string) => (await screen.findByText(title)).closest('li') as HTMLElement;

it('puts a conversation away without asking, and offers it back', async () => {
  render(<Chat />);
  fireEvent.click(within(await row('Research discussion')).getByRole('button', { name: 'Options for Research discussion' }));
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
  fireEvent.click(within(await row('Research discussion')).getByRole('button', { name: 'Options for Research discussion' }));
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
