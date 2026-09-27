import type { GroupMembership } from '../clients/groupService';
import { atLeast, ROLE_PERMISSION, type OwnedResource, type Permission } from './types';

/**
 * What `actorId` may do with `resource`.
 *
 * - A user-owned resource: its owner may do everything.
 * - A group-owned resource: the caller's current role in that group, and
 *   nothing else. The uploader who has left the group gets nothing.
 * - Public: anyone may read, never write.
 *
 * `membership` is the actor's membership in the owning group, when the owner
 * is a group; it is ignored otherwise. Pure, so it can be tested alone.
 */
export function resolveAccess(
  resource: OwnedResource,
  actorId: string | undefined,
  membership?: GroupMembership
): Permission {
  const floor: Permission = resource.visibility === 'public' ? 'read' : 'none';
  if (!actorId) return floor;
  if (resource.owner.kind === 'user') return resource.owner.id === actorId ? 'own' : floor;
  if (!membership?.member || !membership.role) return floor;
  return ROLE_PERMISSION[membership.role];
}

/**
 * Whether the actor may change or delete one item inside a resource (a run, an
 * image group): anything with `manage`, and what they added themselves with
 * `contribute`.
 */
export function canChangeItem(permission: Permission, itemCreatedBy: string | undefined, actorId: string | undefined): boolean {
  if (atLeast(permission, 'manage')) return true;
  return atLeast(permission, 'contribute') && Boolean(actorId) && itemCreatedBy === actorId;
}
