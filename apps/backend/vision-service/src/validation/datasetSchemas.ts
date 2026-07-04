import { z } from '@visin/backend-core';
import { sortOrderSchema } from './common';

const DATASET_SORT_FIELDS = ['name', 'createdAt', 'updatedAt', 'timestamp', 'uuid'] as const;

export const getDatasetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  search: z.string().optional(),
  sortBy: z.enum(DATASET_SORT_FIELDS).default('updatedAt'),
  order: sortOrderSchema('desc')
});
export type GetDatasetsQuery = z.infer<typeof getDatasetsQuerySchema>;

export const createDatasetBodySchema = z.object({
  uuid: z.string().optional(),
  name: z.string().trim().min(1, 'Dataset name is required'),
  description: z.string().trim().optional(),
  timestamp: z.coerce.date().optional(),
  dataset_info: z.unknown().optional(),
  annotations: z.unknown().optional(),
  camera: z.unknown().optional(),
  lidar: z.unknown().optional(),
  metadata: z.unknown().optional(),
  downloadUrl: z.string().optional()
});

export const getSignedUrlForPathQuerySchema = z.object({
  path: z.string().min(1, 'MinIO path is required')
});
