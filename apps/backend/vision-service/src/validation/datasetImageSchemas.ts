import { z } from '@visin/backend-core';
import { looseStringParam } from './common';
import { acceptLegacyFileIdKeys } from '../legacyMinioCompat';

export const getAllImagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(50),
  search: looseStringParam,
  tags: looseStringParam,
  weatherCondition: looseStringParam,
  random: looseStringParam
});
export type GetAllImagesQuery = z.infer<typeof getAllImagesQuerySchema>;

export const getImagesByDatasetQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().optional(),
  search: looseStringParam,
  categoryId: looseStringParam,
  // A repeated query param (?tags=a&tags=b) arrives as string[]; the original
  // handler joined it back into a space-separated string before splitting it
  // again downstream, so match that instead of rejecting the array form.
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(v => (Array.isArray(v) ? v.join(' ') : v)),
  weatherCondition: looseStringParam,
  sortBy: looseStringParam.default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});
export type GetImagesByDatasetQuery = z.infer<typeof getImagesByDatasetQuerySchema>;

const REQUIRED_FIELDS_MSG =
  'Missing required fields: filename, originalName, fileId, datasetId, categoryId, mimetype, size';

// Wrapped so a client still sending the legacy `minioFileId` key validates —
// see legacyMinioCompat.ts.
export const createDatasetImageBodySchema = acceptLegacyFileIdKeys(
  z.object({
    filename: z.string().min(1, REQUIRED_FIELDS_MSG),
    originalName: z.string().min(1, REQUIRED_FIELDS_MSG),
    fileId: z.string().min(1, REQUIRED_FIELDS_MSG),
    datasetId: z.string().min(1, REQUIRED_FIELDS_MSG),
    categoryId: z.string().min(1, REQUIRED_FIELDS_MSG),
    mimetype: z.string().min(1, REQUIRED_FIELDS_MSG),
    size: z.coerce.number({ error: REQUIRED_FIELDS_MSG }),
    title: z.string().optional(),
    description: z.string().optional(),
    width: z.coerce.number().optional(),
    height: z.coerce.number().optional(),
    tags: z.array(z.string()).default([]),
    labels: z.array(z.string()).default([]),
    weatherCondition: z.string().optional(),
    metadata: z.unknown().default({})
  })
);

export const updateImageBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  categoryId: z.string().nullable().optional(),
  weatherCondition: z.string().optional(),
  metadata: z.unknown().optional()
});

export const exportImageNamesQuerySchema = z.object({
  tag: looseStringParam
});
