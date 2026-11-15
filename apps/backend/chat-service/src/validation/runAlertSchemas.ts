import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

/** What vision-service sends when a run finishes. */
export const runFinishedSchema = z
  .object({
    userId: z.string().min(1).max(100),
    trainingId: objectId,
    name: z.string().trim().min(1).max(200),
    status: z.enum(['completed', 'failed']),
    projectName: z.string().trim().max(120).optional()
  })
  .strict();

export const pushPreferencesSchema = z.object({ runs: z.boolean() }).strict();
