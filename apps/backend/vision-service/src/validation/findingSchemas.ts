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
  /** What to change next time. Shorter cap than the body: it is a note, not an essay. */
  recommendations: z.string().max(5_000).optional(),
  /** Runs the conclusion draws on; checked to exist before the finding is stored. */
  trainingIds: z.array(z.string()).max(50).optional()
});

/**
 * How a finding's results table should be built.
 *
 * `selectBy` names the metric deciding which epoch each run is reported at, and
 * `direction` says which end of it is better — asked for rather than inferred,
 * because a run records whatever it chose to and guessing that `loss` is
 * minimised would be wrong on the custom metrics that matter most.
 */
export const exportFindingQuerySchema = z.object({
  selectBy: z.string().max(200).optional(),
  direction: z.enum(['max', 'min']).optional(),
  metrics: z
    .string()
    .max(500)
    .optional()
    .transform((value) => value?.split(',').map((metric) => metric.trim()).filter(Boolean))
});

export type ListFindingsQuery = z.infer<typeof listFindingsQuerySchema>;
export type ExportFindingQuery = z.infer<typeof exportFindingQuerySchema>;
