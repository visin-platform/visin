import { z } from '@visin/backend-core';

export const createBundleBodySchema = z.object({
  name: z.string().trim().min(1, 'name required').max(120),
  groupId: z.string().trim().min(1, 'groupId required')
});

export const previewImportBodySchema = z.object({
  zipFileId: z.string().trim().min(1, 'zipFileId required')
});

/**
 * Optional folder-by-folder wiring for zips that don't use the default layout.
 * Omit it and the defaults (`frames/`, `annotations/<set>/`, `manifest.*`) apply.
 */
export const importMappingSchema = z.object({
  frames: z.string().trim(), // '' = frames sit at the zip root
  annotations: z
    .array(
      z.object({
        path: z.string().trim().min(1, 'annotation folder required'),
        set: z.string().trim().min(1, 'set name required').max(80)
      })
    )
    .max(50)
    .optional(),
  manifest: z.string().trim().min(1).optional(),
  idsSuffix: z.string().trim().min(1).max(40).optional(),
  masksSuffix: z.string().trim().min(1).max(40).optional()
});

export const startImportBodySchema = z.object({
  zipFileId: z.string().trim().min(1, 'zipFileId required'),
  mapping: importMappingSchema.optional()
});
