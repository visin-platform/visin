import { z } from '@visin/backend-core';

export const deleteFolderBodySchema = z.object({
  prefix: z.string().min(1, 'prefix is required')
});

/** Files to delete in one call; a caller with more sends batches. */
export const deleteFilesBodySchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1).max(1000)
});

export const listFilesQuerySchema = z.object({
  prefix: z.string().optional(),
  maxKeys: z.coerce.number().int().positive().default(1000),
  // 'false' lists only the files directly under `prefix`, not its subtrees.
  recursive: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true')
});

export const generateUploadUrlBodySchema = z.object({
  fileId: z.string().min(1, 'fileId is required'),
  mimetype: z.string().optional(),
  maxBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  expiresInMinutes: z.coerce.number().int().positive().default(15)
});

export const generateDownloadUrlBodySchema = z.object({
  fileId: z.string().min(1, 'fileId is required'),
  expiresInMinutes: z.coerce.number().int().positive().default(60)
});

export const generateDownloadUrlsBodySchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1, 'fileIds is required').max(1000),
  expiresInMinutes: z.coerce.number().int().positive().default(60)
});
