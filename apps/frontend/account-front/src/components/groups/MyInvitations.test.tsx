import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const service = vi.hoisted(() => ({ listMyInvitations: vi.fn(), acceptMyInvitation: vi.fn(), declineMyInvitation: vi.fn() }));
vi.mock('../../services/groupService', () => ({ groupService: service }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import MyInvitations from './MyInvitations';

const renderList = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MyInvitations />
    </QueryClientProvider>
  );

const invitation = { id: 'i1', groupId: 'g1', groupName: 'Road team', role: 'admin', invitedBy: 'owner@example.test', expiresAt: '2026-10-01T00:00:00.000Z' };

describe('MyInvitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listMyInvitations.mockResolvedValue([invitation]);
  });

  it('shows nothing when there are no invitations', async () => {
    service.listMyInvitations.mockResolvedValue([]);
    const { container } = renderList();
    await waitFor(() => expect(service.listMyInvitations).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('accepts an invitation', async () => {
    service.acceptMyInvitation.mockResolvedValue({});
    renderList();
    expect(await screen.findByText('Join Road team as admin')).toBeInTheDocument();
    expect(screen.getByText('Invited by owner@example.test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept the invitation to Road team' }));
    await waitFor(() => expect(service.acceptMyInvitation).toHaveBeenCalledWith('i1'));
  });

  it('declines an invitation, and says why an answer failed', async () => {
    service.declineMyInvitation.mockRejectedValue(new Error('Invitation is invalid or expired'));
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline the invitation to Road team' }));
    await waitFor(() => expect(service.declineMyInvitation).toHaveBeenCalledWith('i1'));
    expect(await screen.findByText('Invitation is invalid or expired')).toBeInTheDocument();
  });
});
