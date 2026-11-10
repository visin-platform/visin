import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

export const userParamsSchema = z.object({ id: objectId });
export const userSessionParamsSchema = z.object({ id: objectId, sessionId: objectId });
export const userKeyParamsSchema = z.object({ id: objectId, keyId: objectId });
export const groupParamsSchema = z.object({ id: objectId });
export const membershipParamsSchema = z.object({ groupId: objectId, userId: objectId });
export const runParamsSchema = z.object({ id: objectId });
/** No id is the global policy. */
export const policyParamsSchema = z.object({ id: objectId.optional() });
/** The providers chat-service keeps a key for; it still checks the name itself. */
export const providerKeyParamsSchema = z.object({ provider: z.enum(['anthropic', 'openai']) });

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: objectId.optional()
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
