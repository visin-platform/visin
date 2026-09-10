import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GroupsTab from './GroupsTab';
import { Group } from '../../types/group';

// vi.mock factories are hoisted above module scope, so the mock object has to
// be created inside vi.hoisted to exist by the time the factory runs.
const mockedService = vi.hoisted(() => ({
  listMine: vi.fn(),
  listDeleted: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  deleteForever: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitations: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn()
}));

vi.mock('../../services/groupService', () => ({ groupService: mockedService }));

const auth = vi.hoisted(() => ({ user: { id: 'owner-ID', email: 'owner@x.com' } as { id: string; email: string } | null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

const makeGroup = (overrides: Partial<Group> = {}): Group => ({
  _id: 'g1',
  name: 'Team',
  createdBy: 'owner@x.com',
  members: [
    { userId: 'owner-ID', email: 'owner@x.com', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
    { userId: 'admin-ID', email: 'admin@x.com', role: 'admin', joinedAt: '2026-01-02T00:00:00.000Z' },
    { userId: 'member-ID', email: 'member@x.com', role: 'member', joinedAt: '2026-01-03T00:00:00.000Z' }
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  ...overrides
});

/**
 * Group details live in a collapsed MUI Accordion, whose contents are in the
 * DOM but hidden from the accessibility tree — role queries only see them once
 * the panel is open.
 */
const openGroup = async (name = 'Team') => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`toggle ${name}`, 'i') }));
};

const renderTab = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GroupsTab />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 'owner-ID', email: 'owner@x.com' };
  mockedService.listMine.mockResolvedValue([makeGroup()]);
  mockedService.listDeleted.mockResolvedValue([]);
  mockedService.create.mockResolvedValue(makeGroup());
  mockedService.rename.mockResolvedValue(makeGroup());
  mockedService.remove.mockResolvedValue(undefined);
  mockedService.restore.mockResolvedValue(makeGroup());
  mockedService.deleteForever.mockResolvedValue(undefined);
  mockedService.createInvitation.mockResolvedValue({ token: 'a'.repeat(64) });
  mockedService.revokeInvitations.mockResolvedValue(undefined);
  mockedService.updateMemberRole.mockResolvedValue(makeGroup());
  mockedService.removeMember.mockResolvedValue(makeGroup());
});

describe('GroupsTab list states', () => {
  it('shows a spinner while loading', () => {
    mockedService.listMine.mockReturnValue(new Promise(() => {}));
    renderTab();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows the group, the user role, and the member count', async () => {
    renderTab();

    const summary = await screen.findByRole('button', { name: /toggle team/i });

    expect(within(summary).getByText('Team')).toBeInTheDocument();
    expect(within(summary).getByText('owner')).toBeInTheDocument();
    expect(within(summary).getByText('3 members')).toBeInTheDocument();
  });

  it('singularises the member count', async () => {
    mockedService.listMine.mockResolvedValue([
      makeGroup({ members: [{ userId: 'owner-ID', email: 'owner@x.com', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' }] })
    ]);
    renderTab();

    const summary = await screen.findByRole('button', { name: /toggle team/i });

    expect(within(summary).getByText('1 member')).toBeInTheDocument();
  });

  it('prompts to create one when the user has no groups', async () => {
    mockedService.listMine.mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText(/not in any groups yet/i)).toBeInTheDocument();
  });

  it('reports a failed load', async () => {
    mockedService.listMine.mockRejectedValue(new Error('group-service down'));
    renderTab();

    expect(await screen.findByText(/group-service down/)).toBeInTheDocument();
  });
});

describe('GroupsTab group actions', () => {
  it('creates a group and closes the dialog', async () => {
    renderTab();
    await screen.findByText('Team');

    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: '  Research  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockedService.create).toHaveBeenCalledWith('Research'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ignores a submit with a blank name', async () => {
    renderTab();
    await screen.findByText('Team');

    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByLabelText('Group name'));

    expect(mockedService.create).not.toHaveBeenCalled();
  });

  it('cancels group creation without calling the service', async () => {
    renderTab();
    await screen.findByText('Team');

    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockedService.create).not.toHaveBeenCalled();
  });

  it('renames a group', async () => {
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: /rename group/i }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByLabelText('Save name'));

    await waitFor(() =>
      expect(mockedService.rename).toHaveBeenCalledWith('g1', 'Renamed')
    );
  });

  it('skips the rename call when the name is unchanged', async () => {
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: /rename group/i }));
    fireEvent.click(screen.getByLabelText('Save name'));

    expect(mockedService.rename).not.toHaveBeenCalled();
  });

  it('restores the original name when a rename is cancelled', async () => {
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: /rename group/i }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Discarded' } });
    fireEvent.click(screen.getByLabelText('Cancel rename'));

    fireEvent.click(screen.getByRole('button', { name: /rename group/i }));
    expect(screen.getByLabelText('Group name')).toHaveValue('Team');
    expect(mockedService.rename).not.toHaveBeenCalled();
  });

  it('soft-deletes a group after confirmation', async () => {
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: /delete group/i }));
    expect(screen.getByText(/moves to deleted groups/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedService.remove).toHaveBeenCalledWith('g1'));
  });

  it('does not delete when the confirmation is dismissed', async () => {
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: /delete group/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockedService.remove).not.toHaveBeenCalled();
  });
});

describe('GroupsTab member management', () => {
  it('creates an invite link with the chosen role', async () => {
    renderTab();
    await openGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));
    await waitFor(() => expect(mockedService.createInvitation).toHaveBeenCalledWith('g1', 'member'));
    expect(await screen.findByLabelText('Invitation link')).toHaveValue(`${window.location.origin}/invite#${'a'.repeat(64)}`);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke pending invites' }));
    await waitFor(() => expect(mockedService.revokeInvitations).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(screen.queryByLabelText('Invitation link')).not.toBeInTheDocument());
  });

  it('offers the owner role only to owners', async () => {
    renderTab();
    await openGroup();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Invitation role' }));
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'owner' })).toBeInTheDocument();
  });

  it('changes a member role', async () => {
    renderTab();
    await openGroup();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Role for member@x.com' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'admin' }));

    await waitFor(() =>
      expect(mockedService.updateMemberRole).toHaveBeenCalledWith('g1', 'member-ID', 'admin')
    );
  });

  it('removes a member after confirmation', async () => {
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: 'Remove member@x.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(mockedService.removeMember).toHaveBeenCalledWith('g1', 'member-ID')
    );
  });

  it('will not let the last owner be demoted or removed', async () => {
    renderTab();
    await openGroup();

    // group-service rejects both, so the UI must not offer them.
    expect(screen.queryByRole('combobox', { name: 'Role for owner@x.com' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeDisabled();
  });

  it('lets a second owner be managed once one exists', async () => {
    mockedService.listMine.mockResolvedValue([
      makeGroup({
        members: [
          { userId: 'owner-ID', email: 'owner@x.com', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
          { userId: 'owner2-ID', email: 'owner2@x.com', role: 'owner', joinedAt: '2026-01-02T00:00:00.000Z' }
        ]
      })
    ]);
    renderTab();
    await openGroup();

    expect(screen.getByRole('combobox', { name: 'Role for owner2@x.com' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove owner2@x.com' })).toBeEnabled();
  });
});

describe('GroupsTab permissions', () => {
  it('hides rename, invitations, and delete from a plain member', async () => {
    auth.user = { id: 'member-ID', email: 'member@x.com' };
    renderTab();
    await openGroup();

    expect(screen.queryByRole('button', { name: /rename group/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Invitation role')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete group/i })).not.toBeInTheDocument();
    // ...but they can still leave.
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeEnabled();
  });

  it('lets an admin manage members but not owners or the group itself', async () => {
    auth.user = { id: 'admin-ID', email: 'admin@x.com' };
    renderTab();
    await openGroup();

    expect(screen.getByRole('button', { name: /rename group/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete group$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Role for member@x.com' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove owner@x.com' })).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Invitation role' }));
    expect(within(screen.getByRole('listbox')).queryByRole('option', { name: 'owner' })).not.toBeInTheDocument();
  });

  it('shows no role chip for a non-member viewer', async () => {
    auth.user = { id: 'stranger-ID', email: 'owner@x.com' };
    renderTab();
    await openGroup();

    expect(screen.queryByRole('button', { name: /rename group/i })).not.toBeInTheDocument();
  });
});

describe('GroupsTab leaving a group', () => {
  it('phrases self-removal as leaving and sends the user own account ID', async () => {
    auth.user = { id: 'member-ID', email: 'member@x.com' };
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    expect(screen.getByText('Leave Team?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(mockedService.removeMember).toHaveBeenCalledWith('g1', 'member-ID')
    );
  });
});

describe('GroupsTab deleted groups', () => {
  it('only fetches the deleted list once the section is opened', async () => {
    mockedService.listDeleted.mockResolvedValue([makeGroup({ _id: 'g2', name: 'Old Team' })]);
    renderTab();
    await screen.findByText('Team');

    expect(mockedService.listDeleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Deleted groups'));

    expect(await screen.findByText('Old Team')).toBeInTheDocument();
    expect(mockedService.listDeleted).toHaveBeenCalled();
  });

  it('reports an empty trash', async () => {
    renderTab();
    await screen.findByText('Team');

    fireEvent.click(screen.getByText('Deleted groups'));

    expect(await screen.findByText('No deleted groups.')).toBeInTheDocument();
  });

  it('restores a deleted group', async () => {
    mockedService.listDeleted.mockResolvedValue([makeGroup({ _id: 'g2', name: 'Old Team' })]);
    renderTab();
    await screen.findByText('Team');
    fireEvent.click(screen.getByText('Deleted groups'));

    fireEvent.click(await screen.findByRole('button', { name: /restore/i }));

    await waitFor(() => expect(mockedService.restore).toHaveBeenCalledWith('g2'));
  });

  it('permanently deletes after confirmation', async () => {
    mockedService.listDeleted.mockResolvedValue([makeGroup({ _id: 'g2', name: 'Old Team' })]);
    renderTab();
    await screen.findByText('Team');
    fireEvent.click(screen.getByText('Deleted groups'));

    fireEvent.click(await screen.findByRole('button', { name: /delete forever/i }));
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(mockedService.deleteForever).toHaveBeenCalledWith('g2'));
  });

  it('hides restore controls from a non-owner', async () => {
    auth.user = { id: 'member-ID', email: 'member@x.com' };
    mockedService.listDeleted.mockResolvedValue([makeGroup({ _id: 'g2', name: 'Old Team' })]);
    renderTab();
    await screen.findByText('Team');
    fireEvent.click(screen.getByText('Deleted groups'));

    await screen.findByText('Old Team');
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument();
  });
});

describe('GroupsTab error reporting', () => {
  it('surfaces the service message when a mutation is rejected', async () => {
    mockedService.createInvitation.mockRejectedValue(new Error('Group changed concurrently'));
    renderTab();
    await openGroup();

    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));

    expect(await screen.findByText('Group changed concurrently')).toBeInTheDocument();
  });
});

it('manages ID-only memberships while displaying their account IDs', async () => {
  mockedService.listMine.mockResolvedValue([makeGroup({ members: [
    { userId: 'owner-ID', role: 'owner', joinedAt: '2026-01-01' },
    { userId: 'member-ID', role: 'member', joinedAt: '2026-01-01' }
  ] })]);
  renderTab();
  await openGroup();
  expect(screen.getByText('member-ID')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Role for member-ID' }));
  fireEvent.click(screen.getByRole('option', { name: 'admin' }));
  await waitFor(() => expect(mockedService.updateMemberRole).toHaveBeenCalledWith('g1', 'member-ID', 'admin'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove member-ID' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(mockedService.removeMember).toHaveBeenCalledWith('g1', 'member-ID'));
});
