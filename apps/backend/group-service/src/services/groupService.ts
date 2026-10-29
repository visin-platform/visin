import { BadRequestError, ConflictError, ForbiddenError, listResourceEvents, NotFoundError } from '@visin/backend-core';
import { Group, IGroup } from '../models/Group';
import { GroupAvatar } from '../models/GroupAvatar';
import { ownedByGroup, type Owned } from '../clients/ownedResourcesClient';
import { NOT_DELETED, IS_DELETED, CONCURRENT_CHANGE, revisionFilter, saveGroup, memberRole } from './groupSupport';

// The service's public surface stays here, whichever file a piece now lives in.
export { memberRole } from './groupSupport';
export * from './groupPublic';
export * from './groupMembers';
export * from './groupInvitations';

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
  links?: string[];
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
  if (
    updates.handle !== undefined ||
    updates.description !== undefined ||
    updates.links !== undefined ||
    updates.profilePublic !== undefined
  ) {
    if (myRole !== 'owner') throw new ForbiddenError("Only the group's owner can change its public page");
    if (updates.handle !== undefined) group.handle = updates.handle;
    if (updates.description !== undefined) group.description = updates.description || undefined;
    if (updates.links !== undefined) group.links = updates.links.length ? updates.links : undefined;
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
  await GroupAvatar.deleteOne({ groupId });
}

// ---------------------------------------------------------------------------
// Invitations addressed to an account: "Add member" finds someone who already
// has an account and invites them in the app, where they accept or decline.
// ---------------------------------------------------------------------------

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
