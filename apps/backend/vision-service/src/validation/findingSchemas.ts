import { z } from '@visin/backend-core';

export const listFindingsQuerySchema = z.object({
  project: z.string().optional(),
  training: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export const createFindingBodySchema = z.object({
  project: z.string().min(1, 'A project is required'),
  training: z.string().optional(),
  title: z.string().trim().min(1, 'A title is required').max(200),
  body: z.string().min(1, 'A finding needs a body').max(20_000),
  /** Runs the conclusion draws on; checked to exist before the finding is stored. */
  trainingIds: z.array(z.string()).max(50).optional()
});

export type ListFindingsQuery = z.infer<typeof listFindingsQuerySchema>;
