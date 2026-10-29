import { randomBytes, createHash } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import { Group, IGroup, IGroupInvitation, GroupRole } from '../models/Group';
import { searchUsers } from '../clients/authUsersClient';
import { NOT_DELETED, saveGroup, assertCanAssignRole, memberRole } from './groupSupport';

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

const INVITATION_DAYS = 7;

const MAX_PENDING = 100;

/** More than a page is fetched, so there are still enough after members and invitees are left out. */
const CANDIDATE_FETCH = 25;

const CANDIDATE_LIMIT = 10;

/** Every caller loads the group with `+invitations`, which the schema defaults to an empty list. */
const pending = (group: IGroup, now = new Date()): IGroupInvitation[] =>
  group.invitations!.filter((invitation) => invitation.expiresAt > now);

/** An invitation whose sender has since lost the right to send it no longer stands. */
const stillValid = (group: IGroup, invitation: IGroupInvitation): boolean => {
  try {
    assertCanInvite(group, invitation.createdBy, invitation.role);
    return true;
  } catch {
    return false;
  }
};

/** `mari.tamm@taltech.ee` → `m••••@taltech.ee`: enough to tell two Maris apart, not enough to write to one. */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@');
  return at > 0 ? `${email.charAt(0)}••••${email.slice(at)}` : '••••';
};

export interface Candidate {
  id: string;
  name?: string;
  /** masked unless the query was the whole address */
  email: string;
}

/**
 * People a group's owner or admin could invite: accounts matching `query`
 * (at least 3 characters, enforced by the route), leaving out the group's
 * members and anyone already invited. A search on someone's name shows their
 * address masked; typing the whole address shows it, since the searcher knew it.
 */
export async function findCandidates(groupId: string, actorId: string, query: string): Promise<Candidate[]> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED }).select('+invitations');
  if (!group) throw new NotFoundError();
  const role = memberRole(group, actorId);
  if (role !== 'owner' && role !== 'admin') throw new ForbiddenError();

  const taken = new Set([
    ...group.members.map((member) => member.userId),
    ...pending(group).flatMap((invitation) => (invitation.userId ? [invitation.userId] : []))
  ]);
  const exact = query.trim().toLowerCase();
  const matches = await searchUsers(query.trim(), CANDIDATE_FETCH);
  return matches
    .filter((user) => !taken.has(user.id))
    .slice(0, CANDIDATE_LIMIT)
    .map((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      email: user.email.toLowerCase() === exact ? user.email : maskEmail(user.email)
    }));
}

/** Invite one account, with the same role rules and limits as a link. */
export async function inviteAccount(groupId: string, actorId: string, userId: string, role: GroupRole = 'member') {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED }).select('+invitations');
  if (!group) throw new NotFoundError();
  assertCanInvite(group, actorId, role);
  if (group.members.some((member) => member.userId === userId)) throw new ConflictError('Already a member of this group');
  const now = new Date();
  group.invitations = pending(group, now);
  if (group.invitations.some((invitation) => invitation.userId === userId)) {
    throw new ConflictError('This person already has an invitation to this group');
  }
  if (group.invitations.length >= MAX_PENDING) throw new ConflictError('Revoke pending invitations before creating more');
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  group.invitations.push({ userId, role, createdBy: actorId, expiresAt });
  await saveGroup(group);
  const created = group.invitations[group.invitations.length - 1];
  return { id: String(created._id), userId, role, expiresAt };
}

export interface MyInvitation {
  id: string;
  groupId: string;
  groupName: string;
  role: GroupRole;
  /** the inviter's email, as the group knows it */
  invitedBy?: string;
  expiresAt: Date;
}

/** Invitations waiting for `userId` to accept or decline. */
export async function listMyInvitations(userId: string): Promise<MyInvitation[]> {
  const now = new Date();
  const groups = await Group.find({
    ...NOT_DELETED,
    invitations: { $elemMatch: { userId, expiresAt: { $gt: now } } }
  }).select('+invitations');
  return groups.flatMap((group) =>
    pending(group, now)
      .filter((invitation) => invitation.userId === userId && stillValid(group, invitation))
      .map((invitation) => ({
        id: String(invitation._id),
        groupId: group._id.toString(),
        groupName: group.name,
        role: invitation.role,
        invitedBy: group.members.find((member) => member.userId === invitation.createdBy)?.email,
        expiresAt: invitation.expiresAt
      }))
  );
}

const UNUSABLE = 'Invitation is invalid or expired';

/** Accept an invitation addressed to `userId`. Only that account can. */
export async function acceptAccountInvitation(invitationId: string, userId: string, email?: string): Promise<IGroup> {
  if (!isValidObjectId(invitationId)) throw new NotFoundError(UNUSABLE);
  const now = new Date();
  const group = await Group.findOne({
    ...NOT_DELETED,
    invitations: { $elemMatch: { _id: invitationId, userId, expiresAt: { $gt: now } } }
  }).select('+invitations');
  const invitation = group?.invitations?.find((item) => String(item._id) === invitationId && item.userId === userId);
  if (!group || !invitation) throw new NotFoundError(UNUSABLE);
  assertCanInvite(group, invitation.createdBy, invitation.role);
  if (group.members.some((member) => member.userId === userId)) throw new ConflictError('Already a member of this group');
  group.members.push({ userId, ...(email ? { email } : {}), role: invitation.role, joinedAt: now });
  group.invitations = group.invitations!.filter((item) => String(item._id) !== invitationId);
  // Joining and using up the invitation are one versioned write, as for links.
  group.$where = { deletedAt: null, invitations: { $elemMatch: { _id: invitation._id, userId, expiresAt: { $gt: now } } } };
  await saveGroup(group);
  return group;
}

/** Decline (and so remove) an invitation addressed to `userId`. */
export async function declineAccountInvitation(invitationId: string, userId: string): Promise<void> {
  if (!isValidObjectId(invitationId)) throw new NotFoundError(UNUSABLE);
  const result = await Group.updateOne(
    { invitations: { $elemMatch: { _id: invitationId, userId } } },
    { $pull: { invitations: { _id: invitationId, userId } } }
  );
  if (result.modifiedCount === 0) throw new NotFoundError(UNUSABLE);
}
