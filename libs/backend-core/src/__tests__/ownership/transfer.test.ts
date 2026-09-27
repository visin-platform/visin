import { canTransfer, type MembershipLookup, type ResourceOwner } from '../../ownership';
import type { GroupRole } from '../../clients/groupService';

const ME = 'me';
const MATE = 'mate';
const STRANGER = 'stranger';
const user = (id: string): ResourceOwner => ({ kind: 'user', id });
const group = (id: string): ResourceOwner => ({ kind: 'group', id });

/** roles[group][user] */
const lookupFor = (roles: Record<string, Record<string, GroupRole>>): MembershipLookup => async (groupId, userId) => {
  const role = roles[groupId]?.[userId];
  return role ? { member: true, role } : { member: false, role: null };
};

const lookup = lookupFor({
  lab: { [ME]: 'owner', [MATE]: 'member' },
  team: { [ME]: 'member' },
  others: { [MATE]: 'owner' }
});

describe('canTransfer', () => {
  it('lets a user hand their own resource to a group they are in', async () => {
    expect(await canTransfer(user(ME), group('team'), ME, lookup)).toEqual({ allowed: true });
    expect(await canTransfer(user(ME), group('others'), ME, lookup)).toMatchObject({ allowed: false });
    expect(await canTransfer(user(MATE), group('team'), ME, lookup)).toMatchObject({ allowed: false, reason: 'Only its owner can transfer it' });
  });

  it('does not let a user hand a resource to another person', async () => {
    expect(await canTransfer(user(ME), user(MATE), ME, lookup)).toMatchObject({ allowed: false });
  });

  it("lets the owning group's owner hand it to a member, including themself", async () => {
    expect(await canTransfer(group('lab'), user(ME), ME, lookup)).toEqual({ allowed: true });
    expect(await canTransfer(group('lab'), user(MATE), ME, lookup)).toEqual({ allowed: true });
    expect(await canTransfer(group('lab'), user(STRANGER), ME, lookup)).toMatchObject({ allowed: false });
    expect(await canTransfer(group('team'), user(ME), ME, lookup)).toMatchObject({ allowed: false });
  });

  it("lets the owning group's owner move it to another group they are in", async () => {
    expect(await canTransfer(group('lab'), group('team'), ME, lookup)).toEqual({ allowed: true });
    expect(await canTransfer(group('lab'), group('others'), ME, lookup)).toMatchObject({ allowed: false });
    expect(await canTransfer(group('lab'), group('team'), MATE, lookup)).toMatchObject({ allowed: false });
  });

  it('refuses a visitor, and a move to where it already is', async () => {
    expect(await canTransfer(user(ME), group('team'), undefined, lookup)).toMatchObject({ allowed: false });
    expect(await canTransfer(group('lab'), group('lab'), ME, lookup)).toMatchObject({ allowed: false, reason: 'It already belongs there' });
  });
});
