import { ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { Group, IGroup, GroupRole } from '../models/Group';

/**
 * `deletedAt` has `default: null`, so the field exists on every document —
 * `{ $exists: true }` would match live groups too. Soft-delete state must be
 * tested by value.
 */
const NOT_DELETED = { deletedAt: null };
const IS_DELETED = { deletedAt: { $ne: null } };

/**
 * Stamps activity for one member across many groups in a single write:
 * `/mine` is on label-service's hot path (every job and bundle listing), and
 * one updateOne per returned group turned a read into N serial writes.
 */
export async function updateMemberActivity(groupIds: string[], memberEmail: string): Promise<void> {
  if (groupIds.length === 0) return;
  const normalizedEmail = memberEmail.toLowerCase();
  await Group.updateMany(
    { _id: { $in: groupIds }, 'members.email': normalizedEmail },
    { $set: { 'members.$.lastActivity': new Date() } }
  );
}

export async function createGroup(creatorEmail: string, name: string): Promise<IGroup> {
  const group = await Group.create({
    name: String(name).trim(),
    createdBy: creatorEmail.toLowerCase(),
    members: [{ email: creatorEmail.toLowerCase(), role: 'owner', joinedAt: new Date() }]
  });
  return group;
}

export async function listMyGroups(email: string): Promise<IGroup[]> {
  return Group.find({ 'members.email': email.toLowerCase(), ...NOT_DELETED }).sort({ updatedAt: -1 });
}

export async function listMyDeletedGroups(email: string): Promise<IGroup[]> {
  return Group.find({ 'members.email': email.toLowerCase(), ...IS_DELETED }).sort({ deletedAt: -1 });
}

export async function getGroupIfMember(groupId: string, email: string): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  if (!group.members.some((m) => m.email === email.toLowerCase())) throw new ForbiddenError();
  return group;
}

export async function updateGroup(
  groupId: string,
  actingEmail: string,
  updates: { name?: string }
): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();
  
  if (updates.name !== undefined) {
    group.name = String(updates.name).trim();
  }
  
  await group.save();
  return group;
}

export async function deleteGroup(groupId: string, actingEmail: string): Promise<void> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (myRole !== 'owner') throw new ForbiddenError();
  
  // Soft delete by setting deletedAt timestamp
  group.deletedAt = new Date();
  await group.save();
}

export async function restoreGroup(groupId: string, actingEmail: string): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...IS_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (myRole !== 'owner') throw new ForbiddenError();
  
  // Restore by removing deletedAt timestamp
  group.deletedAt = undefined;
  await group.save();
  return group;
}

export async function permanentlyDeleteGroup(groupId: string, actingEmail: string): Promise<void> {
  const group = await Group.findOne({ _id: groupId, ...IS_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (myRole !== 'owner') throw new ForbiddenError();
  
  // Permanently delete the group
  await Group.findByIdAndDelete(groupId);
}

export async function addMember(
  groupId: string,
  actingEmail: string,
  memberEmail: string,
  role: GroupRole = 'member'
): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();
  
  // Check if user is already a member
  if (group.members.some((m) => m.email === memberEmail.toLowerCase())) {
    throw new ConflictError('User is already a member');
  }
  
  group.members.push({
    email: memberEmail.toLowerCase(),
    role,
    joinedAt: new Date()
  });
  
  await group.save();
  return group;
}

export function memberRole(group: IGroup, email: string): GroupRole | undefined {
  return group.members.find((m) => m.email === email.toLowerCase())?.role as GroupRole | undefined;
}

const ownerCount = (group: IGroup): number => group.members.filter((m) => m.role === 'owner').length;

/**
 * A group with no owner can never be administered again — nobody can delete
 * it, restore it, or promote a replacement — so the last owner may not be
 * demoted or removed. Ownership must be handed over first.
 */
function assertNotLastOwner(group: IGroup, targetRole: GroupRole | undefined): void {
  if (targetRole === 'owner' && ownerCount(group) === 1) {
    throw new ConflictError('Group must have at least one owner');
  }
}

export async function updateMemberRole(
  groupId: string,
  actingEmail: string,
  memberEmail: string,
  role: GroupRole
): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();
  const m = group.members.find((x) => x.email === memberEmail.toLowerCase());
  if (!m) throw new NotFoundError('Member not found');
  // Otherwise an admin could demote the owner or promote itself to owner.
  if (myRole !== 'owner' && (m.role === 'owner' || role === 'owner')) throw new ForbiddenError();
  if (m.role !== role) assertNotLastOwner(group, m.role);
  m.role = role;
  await group.save();
  return group;
}

export async function removeMember(groupId: string, actingEmail: string, targetEmail: string): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole) throw new ForbiddenError();
  const target = group.members.find((m) => m.email === targetEmail.toLowerCase());
  if (!target) throw new NotFoundError('Member not found');
  const isSelf = actingEmail.toLowerCase() === targetEmail.toLowerCase();
  if (!isSelf && myRole === 'member') throw new ForbiddenError();
  // Same reason admins can't demote owners: only an owner removes an owner.
  if (!isSelf && target.role === 'owner' && myRole !== 'owner') throw new ForbiddenError();
  assertNotLastOwner(group, target.role);
  group.members = group.members.filter((m) => m.email !== targetEmail.toLowerCase());
  await group.save();
  return group;
}

export async function checkMembership(
  groupId: string,
  email: string
): Promise<{ member: boolean; role: GroupRole | null }> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const m = group.members.find((x) => x.email === email.toLowerCase());
  return { member: !!m, role: (m?.role as GroupRole) || null };
}
