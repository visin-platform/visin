import { randomBytes, createHash } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { Error as MongooseError } from 'mongoose';
import { Group, IGroup, GroupRole } from '../models/Group';

/**
 * `deletedAt` has `default: null`, so the field exists on every document —
 * `{ $exists: true }` would match live groups too. Soft-delete state must be
 * tested by value.
 */
const NOT_DELETED = { deletedAt: null };
const IS_DELETED = { deletedAt: { $ne: null } };

const CONCURRENT_CHANGE = 'Group changed concurrently; reload it and retry';

function revisionFilter(group: IGroup): number | { $exists: false } {
  return group.__v === undefined ? { $exists: false } : group.__v;
}

async function saveGroup(group: IGroup): Promise<void> {
  // Mongoose's optimistic save omits the version predicate for imported groups
  // without __v. Match that missing key explicitly so their first writes race
  // for a single revision too. Every mutation rechecks permissions on retry.
  group.$where = { ...group.$where, __v: revisionFilter(group) };
  try {
    await group.save();
  } catch (error) {
    if (error instanceof MongooseError.VersionError) throw new ConflictError(CONCURRENT_CHANGE);
    throw error;
  }
}

function assertCanAssignRole(actingRole: GroupRole, role: GroupRole, previousRole?: GroupRole): void {
  if (actingRole !== 'owner' && (role === 'owner' || previousRole === 'owner')) {
    throw new ForbiddenError();
  }
}

/**
 * Stamps activity for one member across many groups in a single write:
 * `/mine` is on label-service's hot path (every job and bundle listing), and
 * one updateOne per returned group turned a read into N serial writes.
 */
export async function updateMemberActivity(groupIds: string[], memberId: string): Promise<void> {
  if (groupIds.length === 0) return;
  await Group.updateMany(
    { _id: { $in: groupIds }, 'members.userId': memberId },
    { $set: { 'members.$.lastActivity': new Date() } }
  );
}

export async function createGroup(creatorId: string, name: string, email?: string): Promise<IGroup> {
  const group = await Group.create({
    name: String(name).trim(),
    createdBy: creatorId,
    members: [{ userId: creatorId, ...(email ? { email } : {}), role: 'owner', joinedAt: new Date() }]
  });
  return group;
}

export async function listMyGroups(userId: string): Promise<IGroup[]> {
  return Group.find({ 'members.userId': userId, ...NOT_DELETED }).sort({ updatedAt: -1 });
}

export async function listMyDeletedGroups(userId: string): Promise<IGroup[]> {
  return Group.find({ 'members.userId': userId, ...IS_DELETED }).sort({ deletedAt: -1 });
}

export async function getGroupIfMember(groupId: string, userId: string): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  if (!group.members.some((m) => m.userId === userId)) throw new ForbiddenError();
  return group;
}

export async function updateGroup(groupId: string, actingId: string, updates: { name?: string }): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();

  if (updates.name !== undefined) {
    group.name = String(updates.name).trim();
  }

  await saveGroup(group);
  return group;
}

export async function deleteGroup(groupId: string, actingId: string): Promise<void> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (myRole !== 'owner') throw new ForbiddenError();

  // Soft delete by setting deletedAt timestamp
  group.deletedAt = new Date();
  await saveGroup(group);
}

export async function restoreGroup(groupId: string, actingId: string): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...IS_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (myRole !== 'owner') throw new ForbiddenError();

  // Restore by removing deletedAt timestamp
  group.deletedAt = undefined;
  await saveGroup(group);
  return group;
}

export async function permanentlyDeleteGroup(groupId: string, actingId: string): Promise<void> {
  const group = await Group.findOne({ _id: groupId, ...IS_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (myRole !== 'owner') throw new ForbiddenError();

  // A restore or ownership change after authorization must invalidate deletion.
  const deleted = await Group.findOneAndDelete({
    _id: groupId,
    ...IS_DELETED,
    __v: revisionFilter(group)
  });
  if (!deleted) throw new ConflictError(CONCURRENT_CHANGE);
}

export function memberRole(group: IGroup, userId: string): GroupRole | undefined {
  return group.members.find((m) => m.userId === userId)?.role as GroupRole | undefined;
}

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

const invitationHash = (token: string): string => createHash('sha256').update(token).digest('hex');

function assertCanInvite(group: IGroup, actorId: string, role: GroupRole): void {
  const currentRole = memberRole(group, actorId);
  if (currentRole !== 'owner' && currentRole !== 'admin') throw new ForbiddenError();
  assertCanAssignRole(currentRole, role);
}

export async function createInvitation(groupId: string, actorId: string, role: GroupRole = 'member') {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED }).select('+invitations');
  if (!group) throw new NotFoundError();
  assertCanInvite(group, actorId, role);
  const now = new Date();
  group.invitations = (group.invitations || []).filter((invitation) => invitation.expiresAt > now);
  if (group.invitations.length >= 100) throw new ConflictError('Revoke pending invitations before creating more');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  group.invitations.push({ tokenHash: invitationHash(token), role, createdBy: actorId, expiresAt });
  await saveGroup(group);
  return { token, expiresAt, role };
}

export async function revokeInvitations(groupId: string, actorId: string): Promise<void> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  assertCanInvite(group, actorId, 'member');
  group.invitations = [];
  await saveGroup(group);
}

async function findInvitation(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new NotFoundError('Invitation is invalid or expired');
  const tokenHash = invitationHash(token);
  const group = await Group.findOne({ 'invitations.tokenHash': tokenHash, ...NOT_DELETED }).select('+invitations');
  const invitation = group?.invitations?.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date());
  if (!group || !invitation) throw new NotFoundError('Invitation is invalid or expired');
  assertCanInvite(group, invitation.createdBy, invitation.role);
  return { group, invitation, tokenHash };
}

export async function previewInvitation(token: string) {
  const { group, invitation } = await findInvitation(token);
  return { groupId: group._id.toString(), name: group.name, role: invitation.role, expiresAt: invitation.expiresAt };
}

export async function acceptInvitation(token: string, userId: string, email?: string): Promise<IGroup> {
  const { group, invitation, tokenHash } = await findInvitation(token);
  if (group.members.some((member) => member.userId === userId))
    throw new ConflictError('Already a member of this group');
  group.members.push({ userId, ...(email ? { email } : {}), role: invitation.role, joinedAt: new Date() });
  group.invitations = group.invitations!.filter((item) => item.tokenHash !== tokenHash);
  // The membership insert and single-use token consumption share one versioned
  // document write. A race or stale authority cannot consume the token alone.
  group.$where = { deletedAt: null, invitations: { $elemMatch: { tokenHash, expiresAt: { $gt: new Date() } } } };
  await saveGroup(group);
  return group;
}
