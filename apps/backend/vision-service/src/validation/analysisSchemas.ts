import { z } from '@visin/backend-core';

export const uploadAnalysisBodySchema = z.object({
  dataset: z.string().min(1, 'Missing required field: dataset'),
  size: z.unknown().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  downloadUrl: z.string().optional()
});

export const updateAnalysisBodySchema = z.object({
  dataset: z.string().min(1, 'Missing required field: dataset'),
  size: z.unknown().optional(),
  data: z.record(z.string(), z.unknown()).default({})
});

export const getAllAnalysesQuerySchema = z.object({
  dataset: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  skip: z.coerce.number().int().nonnegative().default(0)
});
export type GetAllAnalysesQuery = z.infer<typeof getAllAnalysesQuerySchema>;

export const getAnalysisByDatasetQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  skip: z.coerce.number().int().nonnegative().default(0)
});
export type GetAnalysisByDatasetQuery = z.infer<typeof getAnalysisByDatasetQuerySchema>;

export const compareAnalysesBodySchema = z.object({
  analysisIds: z
    .array(z.string())
    .min(1, 'Analysis IDs array is required')
    .max(10, 'Maximum 10 analyses can be compared at once')
});
