import { createOwnershipAccess, readableOwnerFilter, type OwnedResource } from '../../ownership';
import type { GroupServiceClient, MyGroup } from '../../clients/groupService';

const ME = '000000000000000000000001';
const groups: MyGroup[] = [
  { groupId: 'g-owner', name: 'A', role: 'owner' },
  { groupId: 'g-admin', name: 'B', role: 'admin' },
  { groupId: 'g-member', name: 'C', role: 'member' }
];

describe('readableOwnerFilter', () => {
  it('reads: public, mine, and every group I am in', () => {
    expect(readableOwnerFilter(ME, groups)).toEqual({
      $or: [
        { visibility: 'public' },
        { 'owner.kind': 'user', 'owner.id': ME },
        { 'owner.kind': 'group', 'owner.id': { $in: ['g-owner', 'g-admin', 'g-member'] } }
      ]
    });
  });

  it('narrows the groups by the role a level needs, and leaves public out of anything past reading', () => {
    expect(readableOwnerFilter(ME, groups, 'manage')).toEqual({
      $or: [{ 'owner.kind': 'user', 'owner.id': ME }, { 'owner.kind': 'group', 'owner.id': { $in: ['g-owner', 'g-admin'] } }]
    });
    expect(readableOwnerFilter(ME, groups, 'own')).toEqual({
      $or: [{ 'owner.kind': 'user', 'owner.id': ME }, { 'owner.kind': 'group', 'owner.id': { $in: ['g-owner'] } }]
    });
    expect(readableOwnerFilter(ME, [], 'contribute')).toEqual({ $or: [{ 'owner.kind': 'user', 'owner.id': ME }] });
  });

  it('gives a visitor public resources to read, and nothing to write', () => {
    expect(readableOwnerFilter(undefined, [])).toEqual({ $or: [{ visibility: 'public' }] });
    expect(readableOwnerFilter(undefined, [], 'contribute')).toEqual({ _id: { $in: [] } });
  });
});

describe('createOwnershipAccess', () => {
  const client = (): jest.Mocked<GroupServiceClient> => ({
    checkMembership: jest.fn(async (groupId: string) =>
      groupId === 'g-admin' ? { member: true, role: 'admin' as const } : { member: false, role: null }
    ),
    getMyGroups: jest.fn(async () => groups)
  });
  const teams = (id: string): OwnedResource => ({ owner: { kind: 'group', id }, visibility: 'private' });

  it('asks about each group once per request', async () => {
    const groupService = client();
    const access = createOwnershipAccess(ME, groupService);

    expect(await access.permission(teams('g-admin'))).toBe('manage');
    expect(await access.can(teams('g-admin'), 'manage')).toBe(true);
    expect(await access.can(teams('g-other'), 'read')).toBe(false);
    expect(groupService.checkMembership).toHaveBeenCalledTimes(2);

    expect(await access.filter('own')).toEqual(readableOwnerFilter(ME, groups, 'own'));
    expect(await access.myGroups()).toBe(groups);
    expect(groupService.getMyGroups).toHaveBeenCalledTimes(1);
  });

  it('needs no lookups for a user-owned resource, or for a visitor', async () => {
    const groupService = client();
    expect(await createOwnershipAccess(ME, groupService).permission({ owner: { kind: 'user', id: ME }, visibility: 'private' })).toBe('own');

    const visitor = createOwnershipAccess(undefined, groupService);
    expect(await visitor.permission(teams('g-admin'))).toBe('none');
    expect(await visitor.membership('g-admin')).toEqual({ member: false, role: null });
    expect(await visitor.myGroups()).toEqual([]);
    expect(groupService.checkMembership).not.toHaveBeenCalled();
    expect(groupService.getMyGroups).not.toHaveBeenCalled();
  });
});
