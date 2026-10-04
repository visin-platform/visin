import { z } from '@visin/backend-core';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/**
 * Whose activity: one person (`user`, an account id) or one group (`owner`, a group id). Never both and never
 * neither, so a feed is always of someone and an empty query cannot become everyone's.
 */
export const activityQuerySchema = z
  .object({
    user: objectId.optional(),
    owner: objectId.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30)
  })
  .refine((query) => Boolean(query.user) !== Boolean(query.owner), 'Give either user or owner');
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
