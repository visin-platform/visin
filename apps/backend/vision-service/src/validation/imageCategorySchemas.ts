import { z } from '@visin/backend-core';

export const createImageCategoryBodySchema = z.object({
  name: z.string().trim().min(1, 'Missing required fields: name, datasetId'),
  datasetId: z.string().min(1, 'Missing required fields: name, datasetId'),
  description: z.string().trim().optional(),
  color: z.string().trim().optional()
});

export const updateCategoryBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  color: z.string().trim().optional()
});
