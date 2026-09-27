import type { GroupMembership, GroupServiceClient, MyGroup } from '../clients/groupService';
import { resolveAccess } from './access';
import { atLeast, ROLE_PERMISSION, type OwnedResource, type Permission } from './types';

/**
 * A Mongo filter on `owner` and `visibility` that keeps what the caller may do
 * at least `min` with: public resources (for `read` only), their own, and
 * those of groups where their role grants `min`.
 *
 * `myGroups` is the caller's groups with their roles. A service that shares a
 * resource more widely (vision-service's editor groups) adds its own clause.
 */
export function readableOwnerFilter(
  userId: string | undefined,
  myGroups: MyGroup[],
  min: Permission = 'read'
): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  if (min === 'read') clauses.push({ visibility: 'public' });
  if (userId) {
    clauses.push({ 'owner.kind': 'user', 'owner.id': userId });
    const groupIds = myGroups.filter((group) => atLeast(ROLE_PERMISSION[group.role], min)).map((group) => group.groupId);
    if (groupIds.length > 0) clauses.push({ 'owner.kind': 'group', 'owner.id': { $in: groupIds } });
  }
  // Nothing qualifies: a filter that matches no document.
  return clauses.length > 0 ? { $or: clauses } : { _id: { $in: [] } };
}

/**
 * What one caller may do, for the length of one request.
 *
 * Group lookups are memoized, so a list of twenty group-owned rows costs one
 * membership call per distinct group, not per row. Build one per request and
 * never share it: a membership change must be seen by the next request, not
 * served from a stale memo.
 */
export interface OwnershipAccess {
  readonly userId?: string;
  permission(resource: OwnedResource): Promise<Permission>;
  can(resource: OwnedResource, needed: Permission): Promise<boolean>;
  /** The caller's groups with their roles; empty when signed out. */
  myGroups(): Promise<MyGroup[]>;
  /** The caller's membership in one group, for checks beyond a single resource (a transfer). */
  membership(groupId: string): Promise<GroupMembership>;
  /** `readableOwnerFilter` for this caller. */
  filter(min?: Permission): Promise<Record<string, unknown>>;
}

export function createOwnershipAccess(userId: string | undefined, groups: GroupServiceClient): OwnershipAccess {
  const memberships = new Map<string, Promise<GroupMembership>>();
  let mine: Promise<MyGroup[]> | undefined;

  const myGroups = (): Promise<MyGroup[]> => {
    if (!userId) return Promise.resolve([]);
    mine ??= groups.getMyGroups(userId);
    return mine;
  };

  const membership = (groupId: string): Promise<GroupMembership> => {
    if (!userId) return Promise.resolve({ member: false, role: null });
    let found = memberships.get(groupId);
    if (!found) {
      found = groups.checkMembership(groupId, userId);
      memberships.set(groupId, found);
    }
    return found;
  };

  const permission = async (resource: OwnedResource): Promise<Permission> =>
    resolveAccess(resource, userId, resource.owner.kind === 'group' ? await membership(resource.owner.id) : undefined);

  return {
    userId,
    permission,
    can: async (resource, needed) => atLeast(await permission(resource), needed),
    myGroups,
    membership,
    filter: async (min = 'read') => readableOwnerFilter(userId, await myGroups(), min)
  };
}
