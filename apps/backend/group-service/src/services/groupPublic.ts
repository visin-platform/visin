import { avatarUrl, ForbiddenError, NotFoundError, type AvatarType } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import { Group, IGroup } from '../models/Group';
import { GroupAvatar } from '../models/GroupAvatar';
import { NOT_DELETED, memberRole } from './groupSupport';

/** What anyone may know of a group that turned its public page on. Never its members. */
export interface PublicGroup {
  id: string;
  handle: string;
  name: string;
  description?: string;
  /** The group's own sites, as https addresses. */
  links: string[];
  /** The address of its uploaded picture. */
  picture?: string;
  createdAt: string;
}

/** What a list of groups needs of each: enough to name, picture and link it. */
export type ListedGroup = Pick<PublicGroup, 'id' | 'handle' | 'name' | 'description' | 'picture'>;

const toListedGroup = (group: IGroup): ListedGroup => ({
  id: group._id.toString(),
  handle: group.handle as string,
  name: group.name,
  ...(group.description ? { description: group.description } : {}),
  ...(group.picture ? { picture: group.picture } : {})
});

const toPublicGroup = (group: IGroup): PublicGroup => ({
  ...toListedGroup(group),
  links: group.links ?? [],
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
export async function searchPublicGroups(q: string, limit: number): Promise<ListedGroup[]> {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const groups = await Group.find({
    ...PUBLIC,
    $or: [{ handle: new RegExp(`^${escaped.toLowerCase()}`) }, { name: new RegExp(`^${escaped}`, 'i') }]
  })
    .sort({ handle: 1 })
    .limit(limit);
  return groups.map(toListedGroup);
}

/**
 * Groups with a public page, a page at a time in handle order, for the app's directory. What a listing needs and no
 * more: never who is in a group.
 */
export async function listPublicGroups(
  page: number,
  limit: number
): Promise<{
  groups: ListedGroup[];
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
    groups: groups.map(toListedGroup),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

/** Handles of the groups with a public page, in order, for the sitemap. Nothing else about a group leaves with them. */
export async function listPublicGroupHandles(limit: number): Promise<string[]> {
  const groups = await Group.find(PUBLIC).sort({ handle: 1 }).limit(limit).select('handle');
  return groups.map((group) => group.handle as string);
}

/** Where a group's picture is served from; the version moves with each upload. */
export const groupPictureUrl = (groupId: string, version: Date): string | undefined =>
  avatarUrl(`/api/public/avatars/${groupId}`, version, ['GROUP_SERVICE_URL']);

/**
 * Sets a group's picture. Like the rest of its public page, the owner's alone. Returns the address it is served from,
 * or undefined where this deployment has no public address for the service to hand out (nothing is stored then).
 */
export async function setGroupPicture(
  groupId: string,
  actingId: string,
  image: { data: Buffer; contentType: AvatarType }
): Promise<string | undefined> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  if (memberRole(group, actingId) !== 'owner') throw new ForbiddenError("Only the group's owner can change its public page");
  const now = new Date();
  const picture = groupPictureUrl(groupId, now);
  if (!picture) return undefined;

  await GroupAvatar.findOneAndUpdate({ groupId }, { $set: { ...image, updatedAt: now } }, { upsert: true });
  // Not a save of the whole group: a picture must not lose a concurrent edit of the page, nor make one fail.
  await Group.updateOne({ _id: groupId }, { $set: { picture, avatarUpdatedAt: now } });
  return picture;
}

/** Removes a group's picture. The owner's alone. */
export async function removeGroupPicture(groupId: string, actingId: string): Promise<void> {
  const group = await Group.findOne({ _id: groupId, ...NOT_DELETED });
  if (!group) throw new NotFoundError();
  if (memberRole(group, actingId) !== 'owner') throw new ForbiddenError("Only the group's owner can change its public page");
  await GroupAvatar.deleteOne({ groupId });
  await Group.updateOne({ _id: groupId }, { $unset: { picture: '', avatarUpdatedAt: '' } });
}

/** A group's picture for its public page, or not found: a group with no page, none of its own, or that is gone. */
export async function getGroupPicture(groupId: string): Promise<{ data: Buffer; contentType: AvatarType; updatedAt: Date }> {
  if (!isValidObjectId(groupId)) throw new NotFoundError('No such picture');
  const group = await Group.findOne({ ...PUBLIC, _id: groupId, avatarUpdatedAt: { $ne: null } }).select('_id');
  const avatar = group && (await GroupAvatar.findOne({ groupId }));
  if (!avatar) throw new NotFoundError('No such picture');
  return { data: avatar.data, contentType: avatar.contentType, updatedAt: avatar.updatedAt };
}

/**
 * The name and handle of the groups with a public page, for vision- and dataset-service to show beside what
 * a group owns. A group without one is simply absent: not even its existence is told.
 */
export async function lookupPublicGroups(ids: string[]): Promise<Pick<PublicGroup, 'id' | 'handle' | 'name' | 'picture'>[]> {
  const groups = await Group.find({ ...PUBLIC, _id: { $in: ids } });
  return groups.map((group) => ({
    id: group._id.toString(),
    handle: group.handle as string,
    name: group.name,
    ...(group.picture ? { picture: group.picture } : {})
  }));
}
