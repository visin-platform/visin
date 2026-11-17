import { dm, state, analysisOf, showPage } from '../test/chatFixtures';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '../services/apiClient';
import '../utils/chatContext';
import Chat from './ChatPage';
it('opens a ready analysis of the run on a deliberate open, without creating anything yet', async () => {
  render(<Chat panel />);
  await screen.findByText('Research discussion');
  window.dispatchEvent(
    new CustomEvent('visin:chat-context', {
      detail: { title: 'Analyze base model', projectId: 'p1', trainingIds: ['t1'] }
    })
  );
  expect(await screen.findByText('The assistant sees: Analyze base model')).toBeInTheDocument();
  expect(screen.getByText('New chat · only you can read it')).toBeInTheDocument();
  // No ready-made questions: a line on what can be asked, and the asker writes the question.
  expect(screen.getByText('Ask about results, validation peaks or your next experiment.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Summarize this run' })).toBeNull();
  expect(api).not.toHaveBeenCalledWith('/conversations', expect.objectContaining({ kind: 'assistant' }));
});

it('shows an unread count for other conversations', async () => {
  state.conversations = [{ ...dm(), _id: 'c2', title: 'Busy room', seq: 4, lastMessageSeq: 4 }];
  render(<Chat />);
  expect(await screen.findByLabelText('4 unread')).toBeInTheDocument();
});

describe('following the page', () => {
  it('opens the one chat with the assistant, and only says what the page is as it changes', async () => {
    state.enabled = true;
    state.conversations = [dm(), analysisOf()];
    render(<Chat panel />);
    await screen.findByText('Research discussion');
    showPage({ projectId: 'p1', trainingIds: ['t1'], title: 'Base model' });
    expect(await screen.findByText('Private chat · you and this assistant')).toBeInTheDocument();
    expect(screen.getByText('The assistant sees: Base model')).toBeInTheDocument();
    // Another page: the same chat, now about that page.
    showPage({ projectId: 'p1', trainingIds: ['t2'], title: 'Second run' });
    expect(await screen.findByText('The assistant sees: Second run')).toBeInTheDocument();
    expect(screen.getByText('Private chat · you and this assistant')).toBeInTheDocument();
    expect(screen.queryByText('New chat · only you can read it')).toBeNull();
    // Cleared, the next question is a general one, until the page changes again.
    fireEvent.click(screen.getByRole('button', { name: 'Ask a general question instead' }));
    expect(screen.queryByText(/sees:/)).toBeNull();
    showPage({ projectId: 'p1', trainingIds: ['t3'], title: 'Third run' });
    expect(await screen.findByText('The assistant sees: Third run')).toBeInTheDocument();
  });
  it('never switches away from a conversation with people', async () => {
    state.enabled = true;
    render(<Chat panel />);
    fireEvent.click(await screen.findByText('Research discussion'));
    await screen.findByLabelText('Message');
    showPage({ projectId: 'p1', trainingIds: ['t1'], title: 'Base model' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.queryByText('New chat · only you can read it')).toBeNull();
  });
  it('asks about the page the question was asked on, and opens the chat with nothing else', async () => {
    state.enabled = true;
    render(<Chat panel />);
    await screen.findByText('Research discussion');
    showPage({ projectId: 'p1', trainingIds: ['t1'], title: 'Base model' });
    fireEvent.change(await screen.findByLabelText('Ask the analyst'), { target: { value: 'Summarize this run' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/conversations', { kind: 'assistant', title: 'Assistant' })
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/conversations/created/messages',
        expect.objectContaining({
          body: 'Summarize this run',
          context: { projectId: 'p1', trainingIds: ['t1'] }
        })
      )
    );
  });
});

it('offers a simple picker with project analysis behind More options', async () => {
  state.enabled = true;
  render(<Chat panel />);
  fireEvent.click(await screen.findByRole('button', { name: 'New chat' }));
  expect(screen.getByLabelText('Search people or assistants')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  expect(screen.getByRole('region', { name: 'Ask the analyst' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Start a room' })).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Road scene experiments'));
  expect(await screen.findByText('New chat · only you can read it')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation list' }));
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  fireEvent.change(screen.getByLabelText('Search people or assistants'), { target: { value: '@ada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Message @ada' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/conversations', expect.objectContaining({ kind: 'direct', handles: ['ada'] }))
  );
});
