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
  expect(await screen.findByRole('link', { name: 'Analyze base model' })).toHaveAttribute('href', '/trainings/t1');
  expect(screen.getByText('New analysis · only you can read it')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Summarize this run' })).toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith('/conversations', expect.objectContaining({ kind: 'assistant' }));
});

it('shows an unread count for other conversations', async () => {
  state.conversations = [{ ...dm(), _id: 'c2', title: 'Busy room', seq: 4, lastMessageSeq: 4 }];
  render(<Chat />);
  expect(await screen.findByLabelText('4 unread')).toBeInTheDocument();
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
