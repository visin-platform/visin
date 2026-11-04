import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../services/apiClient';
const state = vi.hoisted(() => ({
  view: {
    enabled: false,
    lockedOff: false,
    policy: 'unanimous',
    agreed: false,
    canManage: true,
    canLock: false,
    canAdd: undefined as boolean | undefined,
    whoCanAdd: 'admins' as 'admins' | 'everyone',
    canSetAdditionPolicy: false,
    bots: [{ id: 'a1', name: 'Reviewer', personality: 'Explain assumptions', available: true }],
    pending: ['Alice', 'Bob']
  }
}));
vi.mock('../../services/apiClient', () => ({
  api: vi.fn(async (path: string, body?: { action: string; enabled?: boolean; whoCanAdd?: 'admins' | 'everyone' }) => {
    if (path === '/assistants') return [{ _id: 'a2', name: 'Helper', paused: false }];
    if (path === '/assistants/catalog') return [{ _id: 'a2', name: 'Helper', paused: false }];
    if (body?.action === 'consent')
      state.view = { ...state.view, agreed: Boolean(body.enabled), enabled: Boolean(body.enabled), pending: [] };
    if (body?.action === 'addition-policy' && body.whoCanAdd) state.view = { ...state.view, whoCanAdd: body.whoCanAdd };
    return structuredClone(state.view);
  })
}));

import { SharedAssistants } from './SharedAssistants';
beforeEach(() => {
  vi.clearAllMocks();
  state.view = {
    enabled: false,
    lockedOff: false,
    policy: 'unanimous',
    agreed: false,
    canManage: true,
    canLock: false,
    canAdd: undefined as boolean | undefined,
    whoCanAdd: 'admins' as 'admins' | 'everyone',
    canSetAdditionPolicy: false,
    bots: [{ id: 'a1', name: 'Reviewer', personality: 'Explain assumptions', available: true }],
    pending: ['Alice', 'Bob']
  };
});
it('discloses shared instructions and consent policy, then requires explicit assistant selection', async () => {
  const target = vi.fn();
  render(<SharedAssistants conversationId="c1" target="" onTarget={target} busy={false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Shared assistants off' }));
  expect(await screen.findByText('Explain assumptions')).toBeInTheDocument();
  expect(await screen.findAllByRole('button', { name: 'Share Helper in this chat' })).toHaveLength(1);
  expect(screen.getByText(/Everyone must agree/)).toHaveTextContent('Alice, Bob');
  fireEvent.click(screen.getByRole('button', { name: 'Agree to shared assistants' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/conversations/c1/assistants', { action: 'consent', enabled: true })
  );
  const select = await screen.findByRole('combobox', { name: 'Message audience' });
  expect(select).toHaveTextContent('People only');
  fireEvent.mouseDown(select);
  fireEvent.click(await screen.findByRole('option', { name: 'Ask Reviewer' }));
  expect(target).toHaveBeenCalledWith('a1');
});
it('does not offer administrator controls to ordinary members', async () => {
  state.view = { ...state.view, policy: 'admins', canManage: false };
  render(<SharedAssistants conversationId="c1" target="" onTarget={vi.fn()} busy={false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Shared assistants off' }));
  expect(await screen.findByText('Group administrators control enablement.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Turn shared assistants/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Remove Reviewer/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Share Helper/ })).not.toBeInTheDocument();
});
it('clears the selected assistant when consent is revoked', async () => {
  const target = vi.fn();
  render(<SharedAssistants conversationId="c1" target="a1" onTarget={target} busy={false} />);
  await waitFor(() => expect(target).toHaveBeenCalledWith(''));
});

it('allows delegated additions without offering management controls', async () => {
  state.view = { ...state.view, canManage: false, canAdd: true, whoCanAdd: 'everyone' };
  render(<SharedAssistants conversationId="c1" target="" onTarget={vi.fn()} busy={false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Shared assistants off' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Share Helper in this chat' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/conversations/c1/assistants', { action: 'add', assistantId: 'a2' })
  );
  expect(screen.queryByRole('button', { name: /Remove Reviewer/ })).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Who may add assistants' })).toBeNull();
});
it('lets administrators choose who may add assistants', async () => {
  state.view = { ...state.view, canSetAdditionPolicy: true };
  render(<SharedAssistants conversationId="c1" target="" onTarget={vi.fn()} busy={false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Shared assistants off' }));
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Who may add assistants' }));
  fireEvent.click(await screen.findByRole('option', { name: 'All members' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/conversations/c1/assistants', {
      action: 'addition-policy',
      whoCanAdd: 'everyone'
    })
  );
});
