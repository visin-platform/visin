import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const service = vi.hoisted(() => ({ searchCandidates: vi.fn(), inviteAccount: vi.fn(), createInvitation: vi.fn() }));
vi.mock('../../services/groupService', () => ({ groupService: service }));

import AddMember from './AddMember';

const renderAddMember = (canInviteOwner = false) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AddMember groupId="g1" canInviteOwner={canInviteOwner} />
    </QueryClientProvider>
  );

describe('AddMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.searchCandidates.mockResolvedValue([
      { id: 'u1', name: 'Mari Tamm', email: 'm••••@taltech.ee' },
      { id: 'u2', email: 'jaan@example.test' }
    ]);
    service.inviteAccount.mockResolvedValue({ id: 'i1' });
  });

  it('waits for three characters before searching', async () => {
    renderAddMember();
    await userEvent.type(screen.getByLabelText('Name or email'), 'ma');
    expect(screen.getByText('Type at least 3 characters')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(service.searchCandidates).not.toHaveBeenCalled();
  });

  it('finds people and invites one with the chosen role', async () => {
    renderAddMember();
    fireEvent.mouseDown(screen.getByLabelText('Role'));
    fireEvent.click(await screen.findByRole('option', { name: 'admin' }));
    expect(screen.queryByRole('option', { name: 'owner' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name or email'), 'mari');

    expect(await screen.findByText('Mari Tamm')).toBeInTheDocument();
    expect(screen.getByText('m••••@taltech.ee')).toBeInTheDocument();
    expect(service.searchCandidates).toHaveBeenCalledWith('g1', 'mari');
    fireEvent.click(screen.getByRole('button', { name: 'Invite Mari Tamm' }));

    await waitFor(() => expect(service.inviteAccount).toHaveBeenCalledWith('g1', 'u1', 'admin'));
    expect(await screen.findByText(/Invited Mari Tamm/)).toBeInTheDocument();
  });

  it('offers an invitation link when nobody with that address has an account', async () => {
    service.searchCandidates.mockResolvedValue([]);
    service.createInvitation.mockResolvedValue({ token: 'b'.repeat(64) });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderAddMember(true);

    await userEvent.type(screen.getByLabelText('Name or email'), 'new@example.test');
    expect(await screen.findByText(/No account matches “new@example.test”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy invitation link' }));

    const link = `${window.location.origin}/invite#${'b'.repeat(64)}`;
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    expect(screen.getByLabelText('Invitation link')).toHaveValue(link);
    expect(screen.getByText(/^Copied/)).toBeInTheDocument();
    expect(service.createInvitation).toHaveBeenCalledWith('g1', 'member');
  });

  it('leaves the link on screen to copy by hand when the clipboard is refused', async () => {
    service.searchCandidates.mockResolvedValue([]);
    service.createInvitation.mockResolvedValue({ token: 'c'.repeat(64) });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderAddMember();

    await userEvent.type(screen.getByLabelText('Name or email'), 'someone');
    fireEvent.click(await screen.findByRole('button', { name: 'Copy invitation link' }));
    expect(await screen.findByText(/^Select and copy the link/)).toBeInTheDocument();
  });

  it('says why a search or an invitation failed', async () => {
    service.inviteAccount.mockRejectedValue(new Error('This person already has an invitation to this group'));
    renderAddMember();
    await userEvent.type(screen.getByLabelText('Name or email'), 'jaan');
    fireEvent.click(await screen.findByRole('button', { name: 'Invite jaan@example.test' }));
    expect(await screen.findByText('This person already has an invitation to this group')).toBeInTheDocument();
  });
});
