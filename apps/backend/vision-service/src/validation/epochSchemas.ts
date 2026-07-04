import { z } from '@visin/backend-core';
import { paginationSchema, sortOrderSchema } from './common';

const EPOCH_SORT_FIELDS = ['epoch', 'createdAt', 'updatedAt', 'timestamp'] as const;

export const getEpochsByTrainingQuerySchema = z.object({
  ...paginationSchema,
  sortBy: z.enum(EPOCH_SORT_FIELDS).default('epoch'),
  order: sortOrderSchema('asc')
});
export type GetEpochsByTrainingQuery = z.infer<typeof getEpochsByTrainingQuerySchema>;

const epochCore = {
  epoch: z.coerce.number(),
  timestamp: z.coerce.date().optional(),
  results: z.unknown().refine(v => v !== undefined && v !== null, 'Results are required'),
  learning_rate: z.coerce.number().optional(),
  epoch_time: z.coerce.number().optional(),
  metadata: z.unknown().optional()
};

export const createEpochBodySchema = z.object({
  trainingId: z.string().min(1, 'Training ID is required'),
  training_uuid: z.string().min(1, 'Training UUID is required'),
  epoch_uuid: z.string().optional(),
  system_info: z.unknown().optional(),
  ...epochCore
});

export const updateEpochBodySchema = z.object({
  timestamp: z.coerce.date().optional(),
  results: z.unknown().optional(),
  learning_rate: z.coerce.number().optional(),
  epoch_time: z.coerce.number().optional(),
  metadata: z.unknown().optional()
});

export const createEpochFromJsonBodySchema = z
  .object({
    trainingId: z.string().optional(),
    training_uuid: z.string().optional(),
    epoch_uuid: z.string().optional(),
    ...epochCore
  })
  .refine(data => Boolean(data.trainingId || data.training_uuid), {
    message: 'Either trainingId or training_uuid is required',
    path: ['trainingId']
  });

const batchEpochItem = z.object({
  trainingId: z.string().min(1, 'trainingId is required'),
  training_uuid: z.string().min(1, 'training_uuid is required'),
  epoch_uuid: z.string().optional(),
  ...epochCore
});

export const createEpochsBatchBodySchema = z.object({
  epochs: z.array(batchEpochItem).min(1, 'Epochs array is required and must not be empty')
});
