import { z } from '@visin/backend-core';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character id');

const visibilityFields = {
  visibility: z.enum(['public', 'group']).optional(),
  groupId: objectId.optional()
};

const requireGroupForGroupVisibility = (value: { visibility?: string; groupId?: string }) =>
  value.visibility !== 'group' || Boolean(value.groupId);

export const createDatasetBodySchema = z
  .object({
    name: z.string().trim().min(1, 'A name is required').max(200),
    description: z.string().trim().max(10000).optional(),
    ...visibilityFields
  })
  .refine(requireGroupForGroupVisibility, { message: 'A group dataset needs a groupId', path: ['groupId'] });
export type CreateDatasetBody = z.infer<typeof createDatasetBodySchema>;

export const updateDatasetBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10000).optional(),
    ...visibilityFields
  })
  .refine(requireGroupForGroupVisibility, { message: 'A group dataset needs a groupId', path: ['groupId'] });
export type UpdateDatasetBody = z.infer<typeof updateDatasetBodySchema>;

/** An image of the dataset to show on its card, or null to go back to the automatic choice. */
export const setCoverBodySchema = z.object({ itemId: objectId.nullable() });
export type SetCoverBody = z.infer<typeof setCoverBodySchema>;

export const listDatasetsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30)
});
export type ListDatasetsQuery = z.infer<typeof listDatasetsQuerySchema>;

export const archiveUploadBodySchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, 'A filename is required')
    .max(255)
    .refine((name) => /\.zip$/i.test(name), 'Datasets are uploaded as .zip archives'),
  /** with `lastModified`, identifies the file so an interrupted upload of it can resume */
  size: z.number().int().positive().optional(),
  lastModified: z.number().int().nonnegative().optional()
});
export type ArchiveUploadBody = z.infer<typeof archiveUploadBodySchema>;

const folderMapping = z.object({
  folder: z.string().max(1000),
  group: z.string().trim().min(1, 'Every mapped folder needs a group name').max(100)
});

export const startImportBodySchema = z.object({
  groups: z
    .array(folderMapping)
    .min(1, 'Map at least one folder')
    .max(500)
    .refine(
      (rows) => new Set(rows.map((row) => row.folder.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, ''))).size === rows.length,
      'Each folder can be mapped once'
    ),
  manifest: z.string().max(1000).optional()
});
export type StartImportBody = z.infer<typeof startImportBodySchema>;

export const listItemsQuerySchema = z.object({
  group: z.string().max(100).optional(),
  kind: z.enum(['image', 'json']).optional(),
  stem: z.string().max(500).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(60)
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const internalListQuerySchema = z.object({
  userId: z.string().min(1).optional()
});

export const internalItemsQuerySchema = z.object({
  group: z.string().max(100).optional(),
  kind: z.enum(['image', 'json']).optional(),
  variant: z.string().max(32).optional(),
  /** `true` selects only items without a variant — a frame, not its id map */
  noVariant: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  after: z.string().max(2000).optional(),
  limit: z.coerce.number().int().positive().max(5000).default(1000)
});
export type InternalItemsQuery = z.infer<typeof internalItemsQuerySchema>;

export const jsonFieldsQuerySchema = z.object({
  group: z.string().min(1).max(100),
  variant: z.string().max(32).optional()
});
export type JsonFieldsQuery = z.infer<typeof jsonFieldsQuerySchema>;
