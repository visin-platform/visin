import { z } from '@visin/backend-core';

export const deleteFolderBodySchema = z.object({
  prefix: z.string().min(1, 'prefix is required')
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
  expiresInMinutes: z.coerce.number().int().positive().default(15)
});

export const generateDownloadUrlBodySchema = z.object({
  fileId: z.string().min(1, 'fileId is required'),
  expiresInMinutes: z.coerce.number().int().positive().default(60)
});
