import { ConflictError, ForbiddenError } from '@visin/backend-core';
import { Error as MongooseError } from 'mongoose';
import { IGroup, GroupRole } from '../models/Group';

/**
 * `deletedAt` has `default: null`, so the field exists on every document —
 * `{ $exists: true }` would match live groups too. Soft-delete state must be
 * tested by value.
 */
export const NOT_DELETED = { deletedAt: null };

export const IS_DELETED = { deletedAt: { $ne: null } };

export const CONCURRENT_CHANGE = 'Group changed concurrently; reload it and retry';

export function revisionFilter(group: IGroup): number | { $exists: false } {
  return group.__v === undefined ? { $exists: false } : group.__v;
}

export async function saveGroup(group: IGroup): Promise<void> {
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

export function assertCanAssignRole(actingRole: GroupRole, role: GroupRole, previousRole?: GroupRole): void {
  if (actingRole !== 'owner' && (role === 'owner' || previousRole === 'owner')) {
    throw new ForbiddenError();
  }
}

export function memberRole(group: IGroup, userId: string): GroupRole | undefined {
  return group.members.find((m) => m.userId === userId)?.role as GroupRole | undefined;
}
