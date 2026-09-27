import { atLeast, canChangeItem, permissionRank, resolveAccess, resourceOwnerSchema, type OwnedResource } from '../../ownership';

const ME = '000000000000000000000001';
const OTHER = '000000000000000000000002';
const GROUP = '0000000000000000000000aa';

const mine: OwnedResource = { owner: { kind: 'user', id: ME }, visibility: 'private' };
const teams: OwnedResource = { owner: { kind: 'group', id: GROUP }, visibility: 'private', createdBy: ME };

describe('resolveAccess', () => {
  it('gives a user-owned resource wholly to its owner, and to nobody else', () => {
    expect(resolveAccess(mine, ME)).toBe('own');
    expect(resolveAccess(mine, OTHER)).toBe('none');
    expect(resolveAccess(mine, undefined)).toBe('none');
  });

  it.each([
    ['owner', 'own'],
    ['admin', 'manage'],
    ['member', 'contribute']
  ] as const)("maps a group %s's role to %s", (role, expected) => {
    expect(resolveAccess(teams, ME, { member: true, role })).toBe(expected);
  });

  it('gives the uploader of a group resource nothing once out of the group', () => {
    expect(resolveAccess(teams, ME, { member: false, role: null })).toBe('none');
    expect(resolveAccess(teams, ME)).toBe('none');
  });

  it('lets anyone read a public resource, signed in or not, and write nothing', () => {
    expect(resolveAccess({ ...mine, visibility: 'public' }, undefined)).toBe('read');
    expect(resolveAccess({ ...mine, visibility: 'public' }, OTHER)).toBe('read');
    expect(resolveAccess({ ...teams, visibility: 'public' }, OTHER, { member: false, role: null })).toBe('read');
    expect(resolveAccess({ ...teams, visibility: 'public' }, ME, { member: true, role: 'member' })).toBe('contribute');
  });
});

describe('permission order', () => {
  it('includes the weaker levels in the stronger ones', () => {
    expect(atLeast('own', 'manage')).toBe(true);
    expect(atLeast('contribute', 'read')).toBe(true);
    expect(atLeast('read', 'contribute')).toBe(false);
    expect(atLeast('none', 'read')).toBe(false);
    expect(permissionRank('none')).toBeLessThan(permissionRank('read'));
  });
});

describe('canChangeItem', () => {
  it('lets a manager change anything, and a contributor what they added', () => {
    expect(canChangeItem('manage', OTHER, ME)).toBe(true);
    expect(canChangeItem('contribute', ME, ME)).toBe(true);
    expect(canChangeItem('contribute', OTHER, ME)).toBe(false);
    expect(canChangeItem('contribute', undefined, undefined)).toBe(false);
    expect(canChangeItem('read', ME, ME)).toBe(false);
  });
});

describe('resourceOwnerSchema', () => {
  it('takes a user or a group by id', () => {
    expect(resourceOwnerSchema.parse({ kind: 'group', id: GROUP })).toEqual({ kind: 'group', id: GROUP });
    expect(resourceOwnerSchema.safeParse({ kind: 'team', id: GROUP }).success).toBe(false);
    expect(resourceOwnerSchema.safeParse({ kind: 'user', id: 'me' }).success).toBe(false);
  });
});
