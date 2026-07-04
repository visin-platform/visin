import { z } from '@visin/backend-core';

const GROUP_ROLES = ['owner', 'admin', 'member'] as const;

export const createGroupBodySchema = z.object({
  name: z.string().trim().min(1, 'name required')
});

export const updateGroupBodySchema = z.object({
  name: z.string().trim().min(1, 'name required')
});

export const addMemberBodySchema = z.object({
  email: z.string().min(1, 'email required'),
  role: z.enum(GROUP_ROLES).optional()
});

export const updateRoleBodySchema = z.object({
  role: z.enum(GROUP_ROLES)
});
