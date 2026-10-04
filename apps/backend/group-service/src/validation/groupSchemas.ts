import { z } from '@visin/backend-core';
import { isValidHandle } from '../services/handle';

const GROUP_ROLES = ['owner', 'admin', 'member'] as const;

export const createGroupBodySchema = z.object({
  name: z.string().trim().min(1, 'name required')
});

const groupHandle = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidHandle, 'A handle is 3 to 30 lowercase letters, digits or single hyphens, and not a reserved word');

/**
 * Any of the group's name and its public page. The name is for an owner or admin; the page (handle,
 * description, and whether it is shown) is the owner's alone, which the service enforces.
 */
export const updateGroupBodySchema = z
  .object({
    name: z.string().trim().min(1, 'name required').optional(),
    handle: groupHandle.optional(),
    description: z.string().trim().max(280).optional(),
    profilePublic: z.boolean().optional()
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), 'Nothing to change');

/** Finding groups by the start of their handle or name. Two characters at least. */
export const groupsSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(60),
  limit: z.coerce.number().int().min(1).max(20).default(8)
});

export const handleParamsSchema = z.object({
  handle: z.string().trim().toLowerCase().min(1).max(60)
});

/** vision- and dataset-service ask who owns what they list, in one call. */
export const publicGroupsBodySchema = z.object({
  ids: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid group id')).min(1).max(100)
});

/** With `userId`, an invitation addressed to that account; without, a link anyone holding it can accept. */
export const createInvitationBodySchema = z.object({
  role: z.enum(GROUP_ROLES).default('member'),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'userId must be an account id').optional()
});

/** "Add member": at least three characters, so a search cannot page through every account. */
export const candidatesQuerySchema = z.object({
  q: z.string().trim().min(3, 'Type at least 3 characters').max(254),
  // How an internal caller names the acting account; kept, or validation would strip it.
  userId: z.string().optional()
});
export const invitationTokenBodySchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

export const updateRoleBodySchema = z.object({
  role: z.enum(GROUP_ROLES)
});
