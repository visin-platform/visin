import { z } from '@visin/backend-core';

const GROUP_ROLES = ['owner', 'admin', 'member'] as const;

export const createGroupBodySchema = z.object({
  name: z.string().trim().min(1, 'name required')
});

export const updateGroupBodySchema = z.object({
  name: z.string().trim().min(1, 'name required')
});

export const createInvitationBodySchema = z.object({ role: z.enum(GROUP_ROLES).default('member') });
export const invitationTokenBodySchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

export const updateRoleBodySchema = z.object({
  role: z.enum(GROUP_ROLES)
});
