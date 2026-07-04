import { z } from '@visin/backend-core';
import { paginationSchema, sortOrderSchema } from './common';

const TEST_RESULT_SORT_FIELDS = ['epoch', 'createdAt', 'updatedAt', 'timestamp', 'test_uuid'] as const;

const paginationAndSort = {
  ...paginationSchema,
  sortBy: z.enum(TEST_RESULT_SORT_FIELDS).default('timestamp'),
  order: sortOrderSchema('desc')
};

export const getTestResultsQuerySchema = z.object({
  ...paginationAndSort,
  epoch: z.coerce.number().optional(),
  epoch_uuids: z
    .string()
    .optional()
    .transform(v => (v ? v.split(',').map(uuid => uuid.trim()) : undefined)),
  training_uuid: z.string().optional(),
  projectId: z.string().optional()
});
export type GetTestResultsQuery = z.infer<typeof getTestResultsQuerySchema>;

export const getTestResultsByEpochUuidQuerySchema = z.object(paginationAndSort);
export type GetTestResultsByEpochUuidQuery = z.infer<typeof getTestResultsByEpochUuidQuerySchema>;

export const createTestResultBodySchema = z.object({
  epoch: z.coerce.number(),
  epoch_uuid: z.string().min(1, 'Epoch UUID is required'),
  test_uuid: z.string().optional(),
  timestamp: z.coerce.date().optional(),
  test_results: z.unknown().refine(v => v !== undefined && v !== null, 'Test results are required')
});

export const updateTestResultBodySchema = z.object({
  epoch: z.coerce.number().optional(),
  epoch_uuid: z.string().optional(),
  timestamp: z.coerce.date().optional(),
  test_results: z.unknown().optional()
});

export const compareTestResultsBodySchema = z.object({
  testResultIds: z
    .array(z.string())
    .min(1, 'Test result IDs array is required')
    .max(20, 'Maximum 20 test results can be compared at once')
});

export const compareAggregatedTestResultsBodySchema = z.object({
  trainingIds: z
    .array(z.string())
    .min(1, 'Training IDs array is required')
    .max(20, 'Maximum 20 trainings can be compared at once')
});
