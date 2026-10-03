import { z } from '@visin/backend-core';

/** The runs to pick the best of: one project's, or every run on one dataset. */
export const bestRunQuerySchema = z
  .object({
    /** a project's id or slug */
    projectId: z.string().min(1).optional(),
    /** a Visin dataset id the runs were trained on */
    datasetId: z.string().min(1).optional()
  })
  .refine(query => query.projectId !== undefined || query.datasetId !== undefined, {
    message: 'Name a project or a dataset',
    path: ['projectId']
  });
export type BestRunQuery = z.infer<typeof bestRunQuerySchema>;
