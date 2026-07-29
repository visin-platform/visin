import { z } from '@visin/backend-core';

const UPLOAD_URL_REQUIRED_MSG = 'epoch_uuid, filename, type, and mimetype are required';

export const getVisualizationUploadUrlBodySchema = z.object({
  epoch_uuid: z.string().min(1, UPLOAD_URL_REQUIRED_MSG),
  filename: z.string().min(1, UPLOAD_URL_REQUIRED_MSG),
  type: z.string().min(1, UPLOAD_URL_REQUIRED_MSG),
  mimetype: z.string().min(1, UPLOAD_URL_REQUIRED_MSG)
});

const VISUALIZATION_REQUIRED_MSG = 'epoch_uuid, visualization_uuid, filename, type, fileId, mimetype, and size are required';

export const createVisualizationBodySchema = z.object({
  epoch_uuid: z.string().min(1, VISUALIZATION_REQUIRED_MSG),
  visualization_uuid: z.string().min(1, VISUALIZATION_REQUIRED_MSG),
  filename: z.string().min(1, VISUALIZATION_REQUIRED_MSG),
  type: z.string().min(1, VISUALIZATION_REQUIRED_MSG),
  fileId: z.string().min(1, VISUALIZATION_REQUIRED_MSG),
  mimetype: z.string().min(1, VISUALIZATION_REQUIRED_MSG),
  size: z.coerce.number({ error: VISUALIZATION_REQUIRED_MSG }),
  metadata: z.unknown().optional()
});

export const getVisualizationsByEpochQuerySchema = z.object({
  type: z.string().optional()
});
export type GetVisualizationsByEpochQuery = z.infer<typeof getVisualizationsByEpochQuerySchema>;

export const getVisualizationsByTrainingQuerySchema = z.object({
  type: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  page: z.coerce.number().int().positive().default(1),
  projectId: z.string().optional(),
  includeUrls: z.string().default('true')
});
export type GetVisualizationsByTrainingQuery = z.infer<typeof getVisualizationsByTrainingQuerySchema>;

export const getVisualizationTypesQuerySchema = z.object({
  training_uuid: z.string().optional(),
  epoch_uuid: z.string().optional()
});
export type GetVisualizationTypesQuery = z.infer<typeof getVisualizationTypesQuerySchema>;
