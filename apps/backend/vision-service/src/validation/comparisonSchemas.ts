import { z } from '@visin/backend-core';
import { paginationSchema, sortOrderSchema } from './common';

const COMPARISON_SORT_FIELDS = ['name', 'type', 'createdAt', 'updatedAt', 'uuid'] as const;
const COMPARISON_TYPES = ['trainings', 'tests', 'benchmarks', 'epochs'] as const;

export const getComparisonsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().optional(),
  type: z.enum(COMPARISON_TYPES).optional(),
  projectId: z.string().optional(),
  sortBy: z.enum(COMPARISON_SORT_FIELDS).default('updatedAt'),
  order: sortOrderSchema('desc')
});
export type GetComparisonsQuery = z.infer<typeof getComparisonsQuerySchema>;

export const getComparisonStatsQuerySchema = z.object({
  type: z.enum(COMPARISON_TYPES).optional(),
  projectId: z.string().optional()
});
export type GetComparisonStatsQuery = z.infer<typeof getComparisonStatsQuerySchema>;

export const createComparisonBodySchema = z.object({
  uuid: z.string().optional(),
  name: z.string().trim().min(1, 'Comparison name is required'),
  description: z.string().trim().optional(),
  type: z.enum(COMPARISON_TYPES, {
    error: 'Valid comparison type is required (trainings, tests, benchmarks, epochs)'
  }),
  itemIds: z
    .array(z.string())
    .min(1, 'Item IDs array is required and must not be empty')
    .max(50, 'Maximum 50 items can be compared at once'),
  projectId: z.string().trim().optional(),
  metadata: z.unknown().optional()
});

export const updateComparisonBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  itemIds: z.array(z.string()).optional(),
  metadata: z.unknown().optional()
});
