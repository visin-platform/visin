import { z } from '@visin/backend-core';

export const projectGroupsBodySchema = z.object({
  userId: z.string().min(1).max(200),
  issuedAt: z.number().int(),
  signature: z.string().regex(/^[0-9a-f]{64}$/)
});

export type ProjectGroupsAssertion = z.infer<typeof projectGroupsBodySchema>;
