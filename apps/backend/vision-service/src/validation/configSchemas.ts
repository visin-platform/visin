import { z } from '@visin/backend-core';
import { paginationSchema, sortOrderSchema } from './common';

const CONFIG_SORT_FIELDS = ['createdAt', 'updatedAt', 'config_uuid'] as const;

export const getAllConfigsQuerySchema = z.object({
  ...paginationSchema,
  sortBy: z.enum(CONFIG_SORT_FIELDS).default('createdAt'),
  order: sortOrderSchema('desc')
});
export type GetAllConfigsQuery = z.infer<typeof getAllConfigsQuerySchema>;

export const createConfigBodySchema = z.object({
  summary: z.unknown().refine(v => v !== undefined && v !== null, 'Summary is required'),
  config_data: z.unknown().refine(v => v !== undefined && v !== null, 'Config data is required'),
  config_name: z.string().optional(),
  metadata: z.unknown().optional()
});

// The original handler accepted either `Summary` (capitalized, from some
// upload scripts) or `summary`, falling back to a default — preserved here
// via transform rather than requiring callers to normalize the casing.
export const createConfigFromJsonBodySchema = z
  .object({
    config_data: z.unknown().refine(v => v !== undefined && v !== null, 'Config data is required'),
    Summary: z.string().optional(),
    summary: z.string().optional(),
    config_name: z.string().optional(),
    metadata: z.unknown().optional()
  })
  .transform(({ Summary, summary, ...rest }) => ({
    ...rest,
    summary: Summary || summary || 'Config'
  }));
