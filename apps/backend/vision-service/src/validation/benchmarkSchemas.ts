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

// `results` items aren't validated field-by-field: results are open blobs, so a
// pipeline's own measurements (`batch_size`, `latency_p95_ms`) are kept as sent.
// The Benchmark model names the fields the benchmark page reads and stores the
// rest alongside them.
const systemInfoSchema = z
  .object({
    cpu_count: z.number(),
    cpu_count_logical: z.number(),
    memory_total_gb: z.number()
  })
  .catchall(z.unknown());

export const createBenchmarkBodySchema = z.object({
  benchmark_uuid: z.string().min(1).optional(),
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
