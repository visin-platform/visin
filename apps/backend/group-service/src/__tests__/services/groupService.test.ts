jest.mock('../../models/Group', () => ({
  Group: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn(),
    findByIdAndDelete: jest.fn(),
  },
}));

import {
  updateMemberActivity,
  createGroup,
  listMyGroups,
  listMyDeletedGroups,
  getGroupIfMember,
  updateGroup,
  deleteGroup,
  restoreGroup,
  permanentlyDeleteGroup,
  addMember,
  memberRole,
  updateMemberRole,
  removeMember,
  checkMembership,
} from '../../services/groupService';
import { Group, IGroup, GroupRole } from '../../models/Group';

const mockedGroup = Group as unknown as Record<string, jest.Mock>;

type TestGroup = {
  name: string;
  members: { email: string; role: GroupRole; joinedAt: Date }[];
  deletedAt?: Date;
  save: jest.Mock;
};

const makeGroup = (overrides: Partial<TestGroup> = {}): TestGroup => ({
  name: 'Team',
  members: [
    { email: 'owner@x.com', role: 'owner', joinedAt: new Date() },
    { email: 'admin@x.com', role: 'admin', joinedAt: new Date() },
    { email: 'member@x.com', role: 'member', joinedAt: new Date() },
  ],
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateMemberActivity', () => {
  it('stamps lastActivity for the normalized member email in one write', async () => {
    mockedGroup.updateMany.mockResolvedValue({});

    await updateMemberActivity(['g1', 'g2'], 'Member@X.com');

    expect(mockedGroup.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['g1', 'g2'] }, 'members.email': 'member@x.com' },
      { $set: { 'members.$.lastActivity': expect.any(Date) } }
    );
  });

  it('skips the write when the user is in no groups', async () => {
    await updateMemberActivity([], 'member@x.com');

    expect(mockedGroup.updateMany).not.toHaveBeenCalled();
  });
});

describe('createGroup', () => {
  it('creates a group with the creator as sole owner', async () => {
    const created = makeGroup();
    mockedGroup.create.mockResolvedValue(created);

    const result = await createGroup('Owner@X.com', '  Team  ');

    expect(mockedGroup.create).toHaveBeenCalledWith({
      name: 'Team',
      createdBy: 'owner@x.com',
      members: [{ email: 'owner@x.com', role: 'owner', joinedAt: expect.any(Date) }],
    });
    expect(result).toBe(created);
  });
});

describe('listMyGroups / listMyDeletedGroups', () => {
  it('lists non-deleted groups for a member, newest first', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    mockedGroup.find.mockReturnValue({ sort });

    await listMyGroups('Member@X.com');

    expect(mockedGroup.find).toHaveBeenCalledWith({
      'members.email': 'member@x.com',
      deletedAt: null,
    });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it('lists deleted groups sorted by deletion time', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    mockedGroup.find.mockReturnValue({ sort });

    await listMyDeletedGroups('member@x.com');

    // `deletedAt` defaults to null on every document, so `$exists` would match
    // live groups too — deleted state has to be matched by value.
    expect(mockedGroup.find).toHaveBeenCalledWith({
      'members.email': 'member@x.com',
      deletedAt: { $ne: null },
    });
    expect(sort).toHaveBeenCalledWith({ deletedAt: -1 });
  });
});

describe('getGroupIfMember', () => {
  it('throws NotFound when the group does not exist', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(getGroupIfMember('g1', 'member@x.com')).rejects.toThrow('Not found');
  });

  it('throws Forbidden for a non-member', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(getGroupIfMember('g1', 'stranger@x.com')).rejects.toThrow('Access denied');
  });

  it('returns the group for a member (case-insensitive)', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    await expect(getGroupIfMember('g1', 'Member@X.com')).resolves.toBe(group);
    expect(mockedGroup.findOne).toHaveBeenCalledWith({ _id: 'g1', deletedAt: null });
  });
});

describe('updateGroup', () => {
  it('throws NotFound for a missing group', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(updateGroup('g1', 'owner@x.com', { name: 'New' })).rejects.toThrow('Not found');
  });

  it('forbids plain members from renaming', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(updateGroup('g1', 'member@x.com', { name: 'New' })).rejects.toThrow('Access denied');
  });

  it('forbids non-members', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(updateGroup('g1', 'stranger@x.com', { name: 'New' })).rejects.toThrow('Access denied');
  });

  it('lets admins rename with trimming', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    const result = await updateGroup('g1', 'admin@x.com', { name: '  New Name ' });

    expect(result.name).toBe('New Name');
    expect(group.save).toHaveBeenCalled();
  });

  it('leaves the name untouched when no update is provided', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    const result = await updateGroup('g1', 'owner@x.com', {});

    expect(result.name).toBe('Team');
    expect(group.save).toHaveBeenCalled();
  });
});

describe('deleteGroup (soft)', () => {
  it('throws NotFound for a missing group', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(deleteGroup('g1', 'owner@x.com')).rejects.toThrow('Not found');
  });

  it('only the owner can delete', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(deleteGroup('g1', 'admin@x.com')).rejects.toThrow('Access denied');
  });

  it('soft-deletes by stamping deletedAt', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    await deleteGroup('g1', 'owner@x.com');

    expect(group.deletedAt).toBeInstanceOf(Date);
    expect(group.save).toHaveBeenCalled();
  });
});

describe('restoreGroup', () => {
  it('throws NotFound when no deleted group matches', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(restoreGroup('g1', 'owner@x.com')).rejects.toThrow('Not found');
  });

  it('only the owner can restore', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup({ deletedAt: new Date() }));

    await expect(restoreGroup('g1', 'member@x.com')).rejects.toThrow('Access denied');
  });

  it('clears deletedAt on restore', async () => {
    const group = makeGroup({ deletedAt: new Date() });
    mockedGroup.findOne.mockResolvedValue(group);

    const result = await restoreGroup('g1', 'owner@x.com');

    expect(result.deletedAt).toBeUndefined();
    expect(group.save).toHaveBeenCalled();
  });
});

describe('permanentlyDeleteGroup', () => {
  it('throws NotFound when no deleted group matches', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(permanentlyDeleteGroup('g1', 'owner@x.com')).rejects.toThrow('Not found');
  });

  it('only the owner can permanently delete', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup({ deletedAt: new Date() }));

    await expect(permanentlyDeleteGroup('g1', 'admin@x.com')).rejects.toThrow('Access denied');
  });

  it('removes the document', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup({ deletedAt: new Date() }));
    mockedGroup.findByIdAndDelete.mockResolvedValue({});

    await permanentlyDeleteGroup('g1', 'owner@x.com');

    expect(mockedGroup.findByIdAndDelete).toHaveBeenCalledWith('g1');
    // Only soft-deleted groups are eligible; a live group must not be hard-deleted.
    expect(mockedGroup.findOne).toHaveBeenCalledWith({ _id: 'g1', deletedAt: { $ne: null } });
  });
});

describe('addMember', () => {
  it('throws NotFound for a missing group', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(addMember('g1', 'owner@x.com', 'new@x.com')).rejects.toThrow('Not found');
  });

  it('forbids plain members from adding', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(addMember('g1', 'member@x.com', 'new@x.com')).rejects.toThrow('Access denied');
  });

  it('rejects duplicates with Conflict', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(addMember('g1', 'owner@x.com', 'Member@X.com')).rejects.toThrow(
      'User is already a member'
    );
  });

  it('adds a member with the default role', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    await addMember('g1', 'admin@x.com', 'New@X.com');

    expect(group.members).toHaveLength(4);
    expect(group.members[3]).toEqual(
      expect.objectContaining({ email: 'new@x.com', role: 'member' })
    );
    expect(group.save).toHaveBeenCalled();
  });

  it('adds a member with an explicit role', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    await addMember('g1', 'owner@x.com', 'new@x.com', 'admin');

    expect(group.members[3].role).toBe('admin');
  });
});

describe('memberRole', () => {
  it('returns the role for a member and undefined otherwise', () => {
    const group = makeGroup() as unknown as IGroup;

    expect(memberRole(group, 'Owner@X.com')).toBe('owner');
    expect(memberRole(group, 'nobody@x.com')).toBeUndefined();
  });
});

describe('updateMemberRole', () => {
  it('throws NotFound for a missing group', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(updateMemberRole('g1', 'owner@x.com', 'member@x.com', 'admin')).rejects.toThrow(
      'Not found'
    );
  });

  it('forbids plain members from changing roles', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(updateMemberRole('g1', 'member@x.com', 'admin@x.com', 'member')).rejects.toThrow(
      'Access denied'
    );
  });

  it('throws NotFound for an unknown target member', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(updateMemberRole('g1', 'owner@x.com', 'ghost@x.com', 'admin')).rejects.toThrow(
      'Member not found'
    );
  });

  it('updates the target role', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    await updateMemberRole('g1', 'owner@x.com', 'Member@X.com', 'admin');

    expect(group.members.find((m) => m.email === 'member@x.com')?.role).toBe('admin');
    expect(group.save).toHaveBeenCalled();
  });

  it('forbids an admin from demoting an owner', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(updateMemberRole('g1', 'admin@x.com', 'owner@x.com', 'member')).rejects.toThrow(
      'Access denied'
    );
  });

  it('forbids an admin from promoting itself to owner', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(updateMemberRole('g1', 'admin@x.com', 'admin@x.com', 'owner')).rejects.toThrow(
      'Access denied'
    );
  });

  it('refuses to demote the last owner', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(updateMemberRole('g1', 'owner@x.com', 'owner@x.com', 'admin')).rejects.toThrow(
      'Group must have at least one owner'
    );
  });

  it('demotes an owner once a second owner exists', async () => {
    const group = makeGroup();
    group.members.push({ email: 'owner2@x.com', role: 'owner', joinedAt: new Date() });
    mockedGroup.findOne.mockResolvedValue(group);

    await updateMemberRole('g1', 'owner@x.com', 'owner@x.com', 'admin');

    expect(group.members.find((m) => m.email === 'owner@x.com')?.role).toBe('admin');
  });
});

describe('removeMember', () => {
  it('throws NotFound for a missing group', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(removeMember('g1', 'owner@x.com', 'member@x.com')).rejects.toThrow('Not found');
  });

  it('forbids non-members entirely', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(removeMember('g1', 'stranger@x.com', 'member@x.com')).rejects.toThrow('Access denied');
  });

  it('forbids plain members from removing others', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(removeMember('g1', 'member@x.com', 'admin@x.com')).rejects.toThrow('Access denied');
  });

  it('lets a plain member remove themselves', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    await removeMember('g1', 'Member@X.com', 'member@x.com');

    expect(group.members.some((m) => m.email === 'member@x.com')).toBe(false);
    expect(group.save).toHaveBeenCalled();
  });

  it('lets an admin remove another member', async () => {
    const group = makeGroup();
    mockedGroup.findOne.mockResolvedValue(group);

    await removeMember('g1', 'admin@x.com', 'member@x.com');

    expect(group.members).toHaveLength(2);
  });

  it('throws NotFound for a target who is not a member', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(removeMember('g1', 'owner@x.com', 'ghost@x.com')).rejects.toThrow('Member not found');
  });

  it('forbids an admin from removing an owner', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(removeMember('g1', 'admin@x.com', 'owner@x.com')).rejects.toThrow('Access denied');
  });

  it('refuses to remove the last owner, even self-removal', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(removeMember('g1', 'owner@x.com', 'owner@x.com')).rejects.toThrow(
      'Group must have at least one owner'
    );
  });

  it('removes an owner once a second owner exists', async () => {
    const group = makeGroup();
    group.members.push({ email: 'owner2@x.com', role: 'owner', joinedAt: new Date() });
    mockedGroup.findOne.mockResolvedValue(group);

    await removeMember('g1', 'owner2@x.com', 'owner@x.com');

    expect(group.members.some((m) => m.email === 'owner@x.com')).toBe(false);
  });
});

describe('checkMembership', () => {
  it('throws NotFound for a missing group', async () => {
    mockedGroup.findOne.mockResolvedValue(null);

    await expect(checkMembership('g1', 'member@x.com')).rejects.toThrow('Not found');
  });

  it('reports membership with role', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(checkMembership('g1', 'Admin@X.com')).resolves.toEqual({
      member: true,
      role: 'admin',
    });
  });

  it('reports non-membership with a null role', async () => {
    mockedGroup.findOne.mockResolvedValue(makeGroup());

    await expect(checkMembership('g1', 'nobody@x.com')).resolves.toEqual({
      member: false,
      role: null,
    });
  });
});
