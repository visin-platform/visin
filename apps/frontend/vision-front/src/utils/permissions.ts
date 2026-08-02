import type { AuthUser } from '@visin/frontend-core';

/**
 * Whether the user administers at least one group.
 *
 * The JWT carries two separate claims: `groups` (group *ids* — opaque
 * ObjectId strings) and `groupRoles` (the distinct roles held across them).
 * Destructive actions gate on the roles; checking `groups` for 'owner'/'admin'
 * matches an id, never a role, so it is always false.
 */
export const isGroupAdmin = (user: AuthUser | null | undefined): boolean =>
  user?.groupRoles?.some(role => role === 'owner' || role === 'admin') ?? false;
