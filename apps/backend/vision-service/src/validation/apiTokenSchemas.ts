import { z } from '@visin/backend-core';

export const createTokenBodySchema = z.object({
  name: z.string().trim().min(1, 'Token name is required'),
  projectId: z.string().min(1, 'projectId is required'),
  expiresInDays: z.coerce.number().int().positive().optional()
});
