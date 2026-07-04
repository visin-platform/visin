import { z } from '@visin/backend-core';
import { sortOrderSchema } from './common';

const EPOCH_SORT_FIELDS = ['epoch', 'createdAt', 'updatedAt', 'timestamp'] as const;

// Accepts either a comma-separated string or a repeated query param
// (`?tags=a&tags=b`, which Express parses as string[]) and normalizes both
// into a clean string[] — used to live duplicated in both
// trainingService.getTrainings and .getTrainingStats.
const tagsFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => {
    if (v === undefined) return undefined;
    const arr = Array.isArray(v) ? v : v.split(',');
    const cleaned = arr.map(t => t.trim()).filter(t => t.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  });

export const getTrainingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  datasetId: z.string().optional(),
  projectId: z.string().optional(),
  tags: tagsFilterSchema
});
export type GetTrainingsQuery = z.infer<typeof getTrainingsQuerySchema>;

export const getTrainingStatsQuerySchema = z.object({
  status: z.string().optional(),
  datasetId: z.string().optional(),
  projectId: z.string().optional(),
  tags: tagsFilterSchema
});
export type GetTrainingStatsQuery = z.infer<typeof getTrainingStatsQuerySchema>;

export const getTrainingWithEpochsQuerySchema = z.object({
  sortBy: z.enum(EPOCH_SORT_FIELDS).default('epoch'),
  order: sortOrderSchema('asc')
});
export type GetTrainingWithEpochsQuery = z.infer<typeof getTrainingWithEpochsQuerySchema>;

export const createTrainingBodySchema = z.object({
  uuid: z.string().optional(),
  name: z.string().trim().min(1, 'Training name is required'),
  description: z.string().trim().optional(),
  datasetId: z.string().optional(),
  configId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.string().default('pending'),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  metadata: z.unknown().optional()
});

export const updateTrainingBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  datasetId: z.string().optional(),
  configId: z.string().optional(),
  status: z.string().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  metadata: z.unknown().optional()
});

export const compareTrainingsBodySchema = z.object({
  trainingIds: z
    .array(z.string())
    .min(1, 'Training IDs array is required')
    .max(30, 'Maximum 30 trainings can be compared at once')
});
