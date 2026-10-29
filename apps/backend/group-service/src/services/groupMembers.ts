import { ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { Group, IGroup, GroupRole } from '../models/Group';
import { NOT_DELETED, saveGroup, assertCanAssignRole, memberRole } from './groupSupport';

/**
 * A group with no owner can never be administered again — nobody can delete
 * it, restore it, or promote a replacement — so the last owner may not be
 * demoted or removed. Ownership must be handed over first.
 */
function assertHasOwner(group: IGroup): void {
  // Old concurrent adds could persist duplicate IDs. Authorization uses the
  // first matching record, so a later duplicate owner is not an effective owner.
  const seen = new Set<string>();
  const hasOwner = group.members.some((member) => {
    if (seen.has(member.userId)) return false;
    seen.add(member.userId);
    return member.role === 'owner';
  });
  if (!hasOwner) throw new ConflictError('Group must have at least one owner');
}

export async function updateMemberRole(
  groupId: string,
  actingId: string,
  memberId: string,
  role: GroupRole
): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();
  const m = group.members.find((x) => x.userId === memberId);
  if (!m) throw new NotFoundError('Member not found');
  // Otherwise an admin could demote the owner or promote itself to owner.
  assertCanAssignRole(myRole, role, m.role);
  m.role = role;
  assertHasOwner(group);
  await saveGroup(group);
  return group;
}

export async function removeMember(groupId: string, actingId: string, targetId: string): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (!myRole) throw new ForbiddenError();
  const target = group.members.find((m) => m.userId === targetId);
  if (!target) throw new NotFoundError('Member not found');
  const isSelf = actingId === targetId;
  if (!isSelf && myRole === 'member') throw new ForbiddenError();
  // Same reason admins can't demote owners: only an owner removes an owner.
  if (!isSelf && target.role === 'owner' && myRole !== 'owner') throw new ForbiddenError();
  group.members = group.members.filter((m) => m.userId !== targetId);
  assertHasOwner(group);
  await saveGroup(group);
  return group;
}

export async function checkMembership(
  groupId: string,
  userId: string
): Promise<{ member: boolean; role: GroupRole | null }> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const m = group.members.find((x) => x.userId === userId);
  return { member: !!m, role: (m?.role as GroupRole) || null };
}
