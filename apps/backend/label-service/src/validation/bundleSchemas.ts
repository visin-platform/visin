import { z } from '@visin/backend-core';

export const createBundleBodySchema = z.object({
  name: z.string().trim().min(1, 'name required').max(120),
  description: z.string().trim().max(500).optional(),
  groupId: z.string().trim().min(1, 'groupId required')
});

/**
 * Metadata only. A bundle's images are immutable once imported — jobs, tasks
 * and answers already reference them — so content changes go through another
 * (additive) upload, not through here. `groupId` is deliberately not editable:
 * moving a bundle would change who can see every job drawing from it.
 */
export const updateBundleBodySchema = z
  .object({
    name: z.string().trim().min(1, 'name cannot be empty').max(120).optional(),
    description: z.string().trim().max(500).optional()
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: 'Nothing to update: provide name and/or description'
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
