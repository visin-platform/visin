import { z } from '@visin/backend-core';
import { sortOrderSchema } from './common';
import { costingSchema, taxonomySchema } from './taxonomySchemas';

const PROJECT_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

export const getProjectsQuerySchema = z.object({
  search: z.string().optional(),
  sortBy: z.enum(PROJECT_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema('desc')
});
export type GetProjectsQuery = z.infer<typeof getProjectsQuerySchema>;

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  description: z.string().optional(),
  isPublic: z.coerce.boolean().default(false),
  taxonomy: taxonomySchema.optional(),
  costing: costingSchema.optional()
});

export const updateProjectBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
  slug: z.string().optional(),
  taxonomy: taxonomySchema.optional(),
  costing: costingSchema.optional()
});
