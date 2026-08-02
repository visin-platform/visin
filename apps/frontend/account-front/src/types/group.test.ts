import { describe, it, expect } from 'vitest';
import { Group, isLastOwner, permissionsFor, roleOf } from './group';

const group: Group = {
  _id: 'g1',
  name: 'Team',
  createdBy: 'owner@x.com',
  members: [
    { email: 'owner@x.com', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
    { email: 'admin@x.com', role: 'admin', joinedAt: '2026-01-02T00:00:00.000Z' },
    { email: 'member@x.com', role: 'member', joinedAt: '2026-01-03T00:00:00.000Z' }
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
  it('matches case-insensitively', () => {
    expect(roleOf(group, 'Admin@X.com')).toBe('admin');
  });

  it('is undefined for a non-member or a missing email', () => {
    expect(roleOf(group, 'stranger@x.com')).toBeUndefined();
    expect(roleOf(group, undefined)).toBeUndefined();
  });
});

describe('isLastOwner', () => {
  it('is true for the only owner', () => {
    expect(isLastOwner(group, 'owner@x.com')).toBe(true);
  });

  it('is false once a second owner exists', () => {
    const twoOwners: Group = {
      ...group,
      members: [...group.members, { email: 'owner2@x.com', role: 'owner', joinedAt: '2026-01-04T00:00:00.000Z' }]
    };

    expect(isLastOwner(twoOwners, 'owner@x.com')).toBe(false);
  });

  it('is false for members who are not the owner', () => {
    expect(isLastOwner(group, 'admin@x.com')).toBe(false);
  });
});
