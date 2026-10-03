import { resourceOwnerSchema, visibilitySchema, z } from '@visin/backend-core';
import { sortOrderSchema } from './common';
import { projectStorageSchema } from './artifactSchemas';
import { costingSchema, taxonomySchema } from './taxonomySchemas';

const PROJECT_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

/**
 * `contribute`: only projects the caller may write to (owner or editor group),
 * leaving out other people's public projects. What "your projects" means to a
 * page asking whether someone has started yet.
 */
export const accessFilterSchema = z.enum(['contribute']).optional();

export const getProjectsQuerySchema = z.object({
  search: z.string().optional(),
  access: accessFilterSchema,
  /** `me`, or a group id: only that owner's projects */
  owner: z.union([z.literal('me'), z.string().regex(/^[0-9a-fA-F]{24}$/)]).optional(),
  sortBy: z.enum(PROJECT_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema('desc')
});
export type GetProjectsQuery = z.infer<typeof getProjectsQuerySchema>;

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  description: z.string().optional(),
  editorGroupIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/).transform(id => id.toLowerCase())).max(100).optional(),
  visibility: visibilitySchema.default('private'),
  /** the caller (the default), or one of their groups */
  owner: resourceOwnerSchema.optional(),
  taxonomy: taxonomySchema.optional(),
  stallAfterMinutes: z.number().int().min(1).max(10080).optional(),
  costing: costingSchema.optional(),
  storage: projectStorageSchema.optional()
});

export const updateProjectBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  editorGroupIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/).transform(id => id.toLowerCase())).max(100).optional(),
  visibility: visibilitySchema.optional(),
  slug: z.string().optional(),
  // null clears either one — what the settings screens send when the editor is
  // empty. Rejecting it failed the whole save, not just the cleared field.
  taxonomy: taxonomySchema.nullable().optional(),
  stallAfterMinutes: z.number().int().min(1).max(10080).optional(),
  costing: costingSchema.nullable().optional(),
  // Replaces the whole setting: leaving hfNamespace out clears it.
  storage: projectStorageSchema.optional()
});

export const transferProjectBodySchema = z.object({ owner: resourceOwnerSchema });
