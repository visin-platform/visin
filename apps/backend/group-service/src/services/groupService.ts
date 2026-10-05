import { randomBytes, createHash } from 'crypto';
import { BadRequestError, ConflictError, ForbiddenError, listResourceEvents, NotFoundError } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import { Error as MongooseError } from 'mongoose';
import { Group, IGroup, IGroupInvitation, GroupRole } from '../models/Group';
import { searchUsers } from '../clients/authUsersClient';
import { ownedByGroup, type Owned } from '../clients/ownedResourcesClient';

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

export interface GroupUpdates {
  name?: string;
  handle?: string;
  description?: string;
  profilePublic?: boolean;
}

export async function updateGroup(groupId: string, actingId: string, updates: GroupUpdates): Promise<IGroup> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();

  if (updates.name !== undefined) {
    group.name = String(updates.name).trim();
  }

  // The public page is the owner's: it decides what strangers may know about the group.
  if (updates.handle !== undefined || updates.description !== undefined || updates.profilePublic !== undefined) {
    if (myRole !== 'owner') throw new ForbiddenError("Only the group's owner can change its public page");
    if (updates.handle !== undefined) group.handle = updates.handle;
    if (updates.description !== undefined) group.description = updates.description || undefined;
    if (updates.profilePublic !== undefined) group.profilePublic = updates.profilePublic;
    if (group.profilePublic && !group.handle) throw new BadRequestError('Choose a handle before showing the public page');
  }

  try {
    await saveGroup(group);
  } catch (error) {
    // The unique index decides who has a handle, however many ask at once.
    if ((error as { code?: number }).code === 11000) throw new ConflictError('That handle is taken');
    throw error;
  }
  return group;
}

/** What anyone may know of a group that turned its public page on. Never its members. */
export interface PublicGroup {
  id: string;
  handle: string;
  name: string;
  description?: string;
  createdAt: string;
}

const toPublicGroup = (group: IGroup): PublicGroup => ({
  id: group._id.toString(),
  handle: group.handle as string,
  name: group.name,
  ...(group.description ? { description: group.description } : {}),
  createdAt: group.createdAt.toISOString()
});

const PUBLIC = { profilePublic: true, handle: { $type: 'string' as const }, ...NOT_DELETED };

/** A group's public page by handle. A group that never had one, turned it off, or was deleted reads as not found. */
export async function getPublicGroup(handle: string): Promise<PublicGroup> {
  const group = await Group.findOne({ ...PUBLIC, handle });
  if (!group) throw new NotFoundError('No such group');
  return toPublicGroup(group);
}

/**
 * Groups with a public page by the start of their handle or name, for the app's search. A group without one is not
 * found, whatever it is called, and nothing about its members is ever in the answer.
 */
export async function searchPublicGroups(q: string, limit: number): Promise<Pick<PublicGroup, 'id' | 'handle' | 'name' | 'description'>[]> {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const groups = await Group.find({
    ...PUBLIC,
    $or: [{ handle: new RegExp(`^${escaped.toLowerCase()}`) }, { name: new RegExp(`^${escaped}`, 'i') }]
  })
    .sort({ handle: 1 })
    .limit(limit);
  return groups.map((group) => ({
    id: group._id.toString(),
    handle: group.handle as string,
    name: group.name,
    ...(group.description ? { description: group.description } : {})
  }));
}

/**
 * Groups with a public page, a page at a time in handle order, for the app's directory. What a listing needs and no
 * more: never who is in a group.
 */
export async function listPublicGroups(
  page: number,
  limit: number
): Promise<{
  groups: Pick<PublicGroup, 'id' | 'handle' | 'name' | 'description'>[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const [groups, total] = await Promise.all([
    Group.find(PUBLIC)
      .sort({ handle: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Group.countDocuments(PUBLIC)
  ]);
  return {
    groups: groups.map((group) => ({
      id: group._id.toString(),
      handle: group.handle as string,
      name: group.name,
      ...(group.description ? { description: group.description } : {})
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

/** Handles of the groups with a public page, in order, for the sitemap. Nothing else about a group leaves with them. */
export async function listPublicGroupHandles(limit: number): Promise<string[]> {
  const groups = await Group.find(PUBLIC).sort({ handle: 1 }).limit(limit).select('handle');
  return groups.map((group) => group.handle as string);
}

/**
 * The name and handle of the groups with a public page, for vision- and dataset-service to show beside what
 * a group owns. A group without one is simply absent: not even its existence is told.
 */
export async function lookupPublicGroups(ids: string[]): Promise<Pick<PublicGroup, 'id' | 'handle' | 'name'>[]> {
  const groups = await Group.find({ ...PUBLIC, _id: { $in: ids } });
  return groups.map((group) => ({ id: group._id.toString(), handle: group.handle as string, name: group.name }));
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

const describe = (owned: Owned, singular: string, plural: string, where: string): string | undefined => {
  if (owned.count === 0) return undefined;
  const more = owned.count > owned.names.length ? `, and ${owned.count - owned.names.length} more` : '';
  return `${owned.count} ${owned.count === 1 ? singular : plural} in ${where} (${owned.names.map((name) => `"${name}"`).join(', ')}${more})`;
};

/**
 * A group deleted for good leaves what it owned with nobody who could reach
 * it, so it must own nothing first: its projects and datasets are transferred
 * or deleted, including those in the trash.
 */
async function assertOwnsNothing(groupId: string): Promise<void> {
  const { projects, datasets } = await ownedByGroup(groupId);
  const left = [describe(projects, 'project', 'projects', 'Vision'), describe(datasets, 'dataset', 'datasets', 'Datasets')].filter(Boolean);
  if (left.length > 0) {
    throw new ConflictError(`The group still owns ${left.join(' and ')}. Transfer or delete them first, including any in the trash.`);
  }
}

export async function permanentlyDeleteGroup(groupId: string, actingId: string): Promise<void> {
  const group = await Group.findOne({ _id: groupId, ...IS_DELETED });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingId);
  if (myRole !== 'owner') throw new ForbiddenError();
  await assertOwnsNothing(groupId);

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

// ---------------------------------------------------------------------------
// Invitations addressed to an account: "Add member" finds someone who already
// has an account and invites them in the app, where they accept or decline.
// ---------------------------------------------------------------------------

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

/**
 * What happened to what the group owns or owned — transfers, visibility
 * changes, the trash — newest first, for its owners and admins. The person who
 * did it is named by their email while they are a member.
 */
export async function groupActivity(groupId: string, actingId: string) {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  const role = memberRole(group, actingId);
  if (role !== 'owner' && role !== 'admin') throw new ForbiddenError("Only the group's owners and admins can see its activity");
  const events = await listResourceEvents({ groupId: group._id.toString(), limit: 200 });
  return events.map((event) => ({
    ...event,
    _id: String((event as { _id?: unknown })._id),
    actorEmail: group.members.find((member) => member.userId === event.actorId)?.email
  }));
}
