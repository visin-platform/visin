import { z } from '@visin/backend-core';
import { looseStringParam } from './common';

export const getAllImagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(50),
  search: looseStringParam,
  tags: looseStringParam,
  condition: looseStringParam,
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
  condition: looseStringParam,
  sortBy: looseStringParam.default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});
export type GetImagesByDatasetQuery = z.infer<typeof getImagesByDatasetQuerySchema>;

const UPLOAD_URL_REQUIRED_MSG = 'Missing required fields: filename, mimetype, datasetId';

export const getUploadUrlBodySchema = z.object({
  filename: z.string().min(1, UPLOAD_URL_REQUIRED_MSG),
  mimetype: z.string().min(1, UPLOAD_URL_REQUIRED_MSG),
  datasetId: z.string().min(1, UPLOAD_URL_REQUIRED_MSG),
  categoryId: z.string().min(1).optional()
});
export type GetUploadUrlBody = z.infer<typeof getUploadUrlBodySchema>;

const REQUIRED_FIELDS_MSG =
  'Missing required fields: filename, originalName, fileId, datasetId, categoryId, mimetype, size';

export const createDatasetImageBodySchema = z.object({
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
  condition: z.string().optional(),
  metadata: z.unknown().default({})
});

export const updateImageBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  categoryId: z.string().nullable().optional(),
  condition: z.string().optional(),
  metadata: z.unknown().optional()
});

export const exportImageNamesQuerySchema = z.object({
  tag: looseStringParam,
  // Prepended to each filename in the manifest. Empty by default: the old
  // hard-coded "camera/" assumed a sensor layout only some datasets have.
  pathPrefix: looseStringParam.default('')
});
export type ExportImageNamesQuery = z.infer<typeof exportImageNamesQuerySchema>;
