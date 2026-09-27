import { z } from '@visin/backend-core';

/** The account auth-service is about to issue a project-limited key for. */
export const keyAccessQuerySchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'userId must be an account id')
});
