import { z } from '@visin/backend-core';

export const createBundleBodySchema = z.object({
  name: z.string().trim().min(1, 'name required').max(120),
  groupId: z.string().trim().min(1, 'groupId required')
});

export const startImportBodySchema = z.object({
  zipFileId: z.string().trim().min(1, 'zipFileId required')
});
