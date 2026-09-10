import { describe, it, expect } from 'vitest';
import { Group, isLastOwner, permissionsFor, roleOf } from './group';

const group: Group = {
  _id: 'g1',
  name: 'Team',
  createdBy: 'owner@x.com',
  members: [
    { userId: 'owner-ID', email: 'owner@x.com', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
    { userId: 'admin-ID', email: 'admin@x.com', role: 'admin', joinedAt: '2026-01-02T00:00:00.000Z' },
    { userId: 'member-ID', email: 'member@x.com', role: 'member', joinedAt: '2026-01-03T00:00:00.000Z' }
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z'
};

describe('permissionsFor', () => {
  it('gives an owner everything', () => {
    expect(permissionsFor('owner')).toEqual({
      canRename: true,
      canManageMembers: true,
      canDeleteGroup: true,
      canManageOwners: true
    });
  });

  it('lets an admin manage the group but not owners or deletion', () => {
    expect(permissionsFor('admin')).toEqual({
      canRename: true,
      canManageMembers: true,
      canDeleteGroup: false,
      canManageOwners: false
    });
  });

  it('gives a plain member and a non-member nothing', () => {
    const none = { canRename: false, canManageMembers: false, canDeleteGroup: false, canManageOwners: false };
    expect(permissionsFor('member')).toEqual(none);
    expect(permissionsFor(undefined)).toEqual(none);
  });
});

describe('roleOf', () => {
  it('matches immutable account IDs', () => {
    expect(roleOf(group, 'admin-ID')).toBe('admin');
  });

  it('is undefined for a non-member or a missing account ID', () => {
    expect(roleOf(group, 'stranger@x.com')).toBeUndefined();
    expect(roleOf(group, undefined)).toBeUndefined();
    expect(roleOf(group, 'admin@x.com')).toBeUndefined();
    expect(roleOf(group, 'Admin-ID')).toBeUndefined();
  });
});

describe('isLastOwner', () => {
  it('is true for the only owner', () => {
    expect(isLastOwner(group, 'owner-ID')).toBe(true);
  });

  it('is false once a second owner exists', () => {
    const twoOwners: Group = {
      ...group,
      members: [...group.members, { userId: 'owner2-ID', email: 'owner2@x.com', role: 'owner', joinedAt: '2026-01-04T00:00:00.000Z' }]
    };

    expect(isLastOwner(twoOwners, 'owner-ID')).toBe(false);
  });

  it('is false for members who are not the owner', () => {
    expect(isLastOwner(group, 'admin-ID')).toBe(false);
  });
});
