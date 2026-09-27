import { z } from 'zod';
import type { GroupRole } from '../clients/groupService';

/**
 * Who controls a top-level resource (a project, a dataset): one person, or a
 * group whose current roles decide who may do what. Everything under the
 * resource follows it.
 */
export interface ResourceOwner {
  kind: 'user' | 'group';
  id: string;
}

export const resourceOwnerSchema = z.object({
  kind: z.enum(['user', 'group']),
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Owner id must be an account or group id')
});

/**
 * Who else may read it. `public` means anyone, signed in or not. There is no
 * "every signed-in user" level: on an instance several organisations share,
 * that would leak between them.
 */
export const VISIBILITIES = ['private', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const visibilitySchema = z.enum(VISIBILITIES);

/**
 * What one caller may do with one resource, weakest first; each level includes
 * the ones before it.
 *
 * - `read`: see it.
 * - `contribute`: add to it (runs, images, labels) and change what they added.
 * - `manage`: change anything in it, its settings, and move it to the trash.
 * - `own`: make it public, transfer it, restore or empty its trash.
 */
export const PERMISSIONS = ['none', 'read', 'contribute', 'manage', 'own'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const permissionRank = (permission: Permission): number => PERMISSIONS.indexOf(permission);

/** Whether `held` is `needed` or more. */
export const atLeast = (held: Permission, needed: Permission): boolean => permissionRank(held) >= permissionRank(needed);

/** A group role, as a permission on what the group owns. */
export const ROLE_PERMISSION: Record<GroupRole, Permission> = {
  owner: 'own',
  admin: 'manage',
  member: 'contribute'
};

/** What `resolveAccess` needs to know about a resource. */
export interface OwnedResource {
  owner: ResourceOwner;
  visibility: Visibility;
  /** attribution only: never widens access */
  createdBy?: string;
}
