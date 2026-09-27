import { z } from '@visin/backend-core';

const GROUP_ROLES = ['owner', 'admin', 'member'] as const;

export const createGroupBodySchema = z.object({
  name: z.string().trim().min(1, 'name required')
});

export const updateGroupBodySchema = z.object({
  name: z.string().trim().min(1, 'name required')
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
