import { state } from '../test/chatFixtures';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/apiClient';
import '../utils/chatContext';
import Chat from './ChatPage';
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
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
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

it('shows another participant’s shared progress without offering cancellation', async () => {
  state.runs = [
    {
      _id: 'job-shared',
      userId: 'bob',
      assistantName: 'Reviewer',
      state: 'running',
      activity: 'Preparing shared answer',
      canCancel: false,
      canRetry: false
    }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect(await screen.findByText('Reviewer · Preparing shared answer')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Stop analysis' })).toBeNull();
});

it('does not offer retry for another participant’s failed shared question', async () => {
  state.enabled = true;
  state.messages = [
    {
      _id: 'q1',
      kind: 'person',
      senderName: 'Bob',
      body: 'Question',
      seq: 1,
      createdAt: '2026-11-04T12:00:00Z',
      evidence: []
    }
  ];
  state.runs = [
    {
      _id: 'job-shared',
      userId: 'bob',
      messageId: 'q1',
      state: 'failed',
      activity: 'Failed',
      error: 'The assistant could not complete this reply.',
      canCancel: false,
      canRetry: false
    }
  ];
  render(<Chat />);
  fireEvent.click(await screen.findByText('Research discussion'));
  expect(await screen.findByText('The assistant could not complete this reply.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});
