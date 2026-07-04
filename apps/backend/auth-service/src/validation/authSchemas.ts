import { z } from '@visin/backend-core';

export const validateTokenBodySchema = z.object({
  idToken: z.string().min(1, 'Token is required')
});

export const invalidateUserTokensBodySchema = z.object({
  email: z.string().min(1, 'Email is required')
});

export const approveUserBodySchema = z.object({
  email: z.string().min(1, 'email required')
});

export const updateProfileBodySchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional()
});
