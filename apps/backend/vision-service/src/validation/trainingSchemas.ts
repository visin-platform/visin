import { z } from '@visin/backend-core';
import { MAX_PAGE_SIZE, sortOrderSchema } from './common';

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

// Training ids, comma-separated or repeated, for fetching a known handful
// (a comparison's members) instead of paging through every run.
const idsFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => {
    if (v === undefined) return undefined;
    const ids = (Array.isArray(v) ? v : v.split(',')).map(id => id.trim()).filter(id => id.length > 0);
    return ids.length > 0 ? ids : undefined;
  })
  .refine(ids => ids === undefined || ids.length <= 100, 'At most 100 ids');

/** Columns the trainings list sorts by. The last five are computed per run. */
export const TRAINING_SORT_FIELDS = [
  'name', 'status', 'createdAt', 'updatedAt', 'epochCount', 'totalTime', 'cpuCost', 'gpuCost', 'totalCost'
] as const;
export type TrainingSortField = (typeof TRAINING_SORT_FIELDS)[number];

export const getTrainingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  datasetId: z.string().optional(),
  projectId: z.string().optional(),
  tags: tagsFilterSchema,
  /** Leave out runs carrying any of these tags. */
  excludeTags: tagsFilterSchema,
  ids: idsFilterSchema,
  sortBy: z.enum(TRAINING_SORT_FIELDS).default('updatedAt'),
  order: sortOrderSchema('desc')
});
export type GetTrainingsQuery = z.infer<typeof getTrainingsQuerySchema>;

export const getTrainingStatsQuerySchema = z.object({
  status: z.string().optional(),
  datasetId: z.string().optional(),
  projectId: z.string().optional(),
  tags: tagsFilterSchema
});
export type GetTrainingStatsQuery = z.infer<typeof getTrainingStatsQuerySchema>;

export const getDeletedTrainingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30)
});
export type GetDeletedTrainingsQuery = z.infer<typeof getDeletedTrainingsQuerySchema>;

export const getTrainingWithEpochsQuerySchema = z.object({
  sortBy: z.enum(EPOCH_SORT_FIELDS).default('epoch'),
  order: sortOrderSchema('asc'),
  /**
   * Return about this many evenly spaced epochs instead of every one.
   *
   * For callers that plot or summarise a curve rather than read it: a
   * 100-epoch run answers this endpoint with 196 KB, and a client sampling it
   * down to a dozen points afterwards has already paid to serialize, ship and
   * parse all of it. The ends are always kept, since they are the two points a
   * question about a curve is usually actually about.
   */
  sample: z.coerce.number().int().min(2).max(500).optional()
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
