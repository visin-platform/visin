import { z } from '@visin/backend-core';
import { paginationSchema, sortOrderSchema } from './common';

const BENCHMARK_SORT_FIELDS = ['createdAt', 'updatedAt', 'timestamp'] as const;

export const getBenchmarksQuerySchema = z.object({
  ...paginationSchema,
  training_uuid: z.string().optional(),
  projectId: z.string().optional(),
  sortBy: z.enum(BENCHMARK_SORT_FIELDS).default('timestamp'),
  order: sortOrderSchema('desc')
});
export type GetBenchmarksQuery = z.infer<typeof getBenchmarksQuerySchema>;

export const getBenchmarkStatsQuerySchema = z.object({
  training_uuid: z.string().optional()
});
export type GetBenchmarkStatsQuery = z.infer<typeof getBenchmarkStatsQuerySchema>;

// `results` items aren't validated field-by-field: the Benchmark model's own
// sub-schema already strips anything it doesn't recognize at save time, and
// the original handler only ever checked "is this an array" — matching that
// leniency here avoids rejecting legitimate payloads with fields this schema
// doesn't happen to enumerate.
const systemInfoSchema = z
  .object({
    cpu_count: z.number(),
    cpu_count_logical: z.number(),
    memory_total_gb: z.number()
  })
  .catchall(z.unknown());

export const createBenchmarkBodySchema = z.object({
  timestamp: z.coerce.date(),
  system_info: systemInfoSchema,
  results: z.array(z.record(z.string(), z.unknown())),
  training_uuid: z.string().optional(),
  epoch_uuid: z.string().optional(),
  epoch: z.coerce.number().optional()
});
export type CreateBenchmarkBody = z.infer<typeof createBenchmarkBodySchema>;

export const updateBenchmarkBodySchema = z.object({
  timestamp: z.coerce.date().optional(),
  system_info: z.record(z.string(), z.unknown()).optional(),
  results: z.array(z.record(z.string(), z.unknown())).optional(),
  training_uuid: z.string().optional(),
  epoch_uuid: z.string().optional(),
  epoch: z.coerce.number().optional()
});
export type UpdateBenchmarkBody = z.infer<typeof updateBenchmarkBodySchema>;
