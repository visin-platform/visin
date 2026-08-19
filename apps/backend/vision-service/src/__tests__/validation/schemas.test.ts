import { paginationSchema, sortOrderSchema, looseStringParam } from '../../validation/common';
import {
  analysisUploadUrlBodySchema,
  uploadAnalysisBodySchema,
  updateAnalysisBodySchema,
  getAllAnalysesQuerySchema,
  getAnalysisByDatasetQuerySchema,
  compareAnalysesBodySchema,
} from '../../validation/analysisSchemas';
import { createTokenBodySchema } from '../../validation/apiTokenSchemas';
import {
  getBenchmarksQuerySchema,
  getBenchmarkStatsQuerySchema,
  createBenchmarkBodySchema,
  updateBenchmarkBodySchema,
} from '../../validation/benchmarkSchemas';
import {
  getComparisonsQuerySchema,
  getComparisonStatsQuerySchema,
  createComparisonBodySchema,
  updateComparisonBodySchema,
} from '../../validation/comparisonSchemas';
import {
  getAllConfigsQuerySchema,
  createConfigBodySchema,
  createConfigFromJsonBodySchema,
} from '../../validation/configSchemas';
import {
  getAllImagesQuerySchema,
  getImagesByDatasetQuerySchema,
  createDatasetImageBodySchema,
  updateImageBodySchema,
  exportImageNamesQuerySchema,
} from '../../validation/datasetImageSchemas';
import {
  getDatasetsQuerySchema,
  createDatasetBodySchema,
} from '../../validation/datasetSchemas';
import {
  getEpochsByTrainingQuerySchema,
  createEpochBodySchema,
  updateEpochBodySchema,
  createEpochFromJsonBodySchema,
  createEpochsBatchBodySchema,
} from '../../validation/epochSchemas';
import {
  createImageCategoryBodySchema,
  updateCategoryBodySchema,
} from '../../validation/imageCategorySchemas';
import {
  getProjectsQuerySchema,
  createProjectBodySchema,
  updateProjectBodySchema,
} from '../../validation/projectSchemas';
import {
  getTestResultsQuerySchema,
  getTestResultsByEpochUuidQuerySchema,
  createTestResultBodySchema,
  updateTestResultBodySchema,
  compareTestResultsBodySchema,
  compareAggregatedTestResultsBodySchema,
} from '../../validation/testResultSchemas';
import {
  getTrainingsQuerySchema,
  getTrainingStatsQuerySchema,
  getTrainingWithEpochsQuerySchema,
  createTrainingBodySchema,
  updateTrainingBodySchema,
  compareTrainingsBodySchema,
} from '../../validation/trainingSchemas';
import {
  getVisualizationUploadUrlBodySchema,
  createVisualizationBodySchema,
  getVisualizationsByEpochQuerySchema,
  getVisualizationsByTrainingQuerySchema,
  getVisualizationTypesQuerySchema,
} from '../../validation/visualizationSchemas';
import { z } from '@visin/backend-core';

describe('common', () => {
  it('paginationSchema leaves page/limit optional but coerces them', () => {
    const schema = z.object(paginationSchema);
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10 });
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('sortOrderSchema maps asc/desc to Mongo directions with a default', () => {
    expect(sortOrderSchema('desc').parse(undefined)).toBe(-1);
    expect(sortOrderSchema('asc').parse(undefined)).toBe(1);
    expect(sortOrderSchema().parse('asc')).toBe(1);
    expect(sortOrderSchema().parse('desc')).toBe(-1);
    expect(sortOrderSchema().safeParse('sideways').success).toBe(false);
  });

  it('looseStringParam takes the first value of a repeated param', () => {
    expect(looseStringParam.parse('a')).toBe('a');
    expect(looseStringParam.parse(['a', 'b'])).toBe('a');
    expect(looseStringParam.parse(undefined)).toBeUndefined();
  });
});

describe('analysisSchemas', () => {
  it('uploadAnalysisBodySchema requires dataset and drops client-set size/downloadUrl', () => {
    expect(uploadAnalysisBodySchema.safeParse({ dataset: 'waymo' }).success).toBe(true);
    expect(uploadAnalysisBodySchema.safeParse({}).success).toBe(false);
    expect(uploadAnalysisBodySchema.parse({ dataset: 'waymo', size: '9 TB', downloadUrl: 'http://x' })).toEqual({
      dataset: 'waymo'
    });
  });

  it('updateAnalysisBodySchema leaves omitted fields out so a rename cannot wipe data', () => {
    expect(updateAnalysisBodySchema.parse({ dataset: 'zod' })).toEqual({ dataset: 'zod' });
    expect(updateAnalysisBodySchema.parse({ data: { a: 1 } })).toEqual({ data: { a: 1 } });
    expect(updateAnalysisBodySchema.safeParse({ dataset: '' }).success).toBe(false);
  });

  it('analysisUploadUrlBodySchema requires a filename and defaults the mimetype', () => {
    expect(analysisUploadUrlBodySchema.parse({ filename: 'ds.zip' })).toEqual({
      filename: 'ds.zip',
      mimetype: 'application/octet-stream'
    });
    expect(analysisUploadUrlBodySchema.safeParse({}).success).toBe(false);
  });

  it('query schemas default limit/skip', () => {
    expect(getAllAnalysesQuerySchema.parse({})).toEqual({ limit: 50, skip: 0 });
    expect(getAnalysisByDatasetQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5, skip: 0 });
  });

  it('compareAnalysesBodySchema bounds the id list to 1..10', () => {
    expect(compareAnalysesBodySchema.safeParse({ analysisIds: [] }).success).toBe(false);
    expect(compareAnalysesBodySchema.safeParse({ analysisIds: ['a'] }).success).toBe(true);
    expect(
      compareAnalysesBodySchema.safeParse({ analysisIds: Array(11).fill('x') }).success
    ).toBe(false);
  });
});

describe('apiTokenSchemas', () => {
  it('requires name and projectId, coerces expiresInDays', () => {
    expect(createTokenBodySchema.parse({ name: ' t ', projectId: 'p', expiresInDays: '30' })).toEqual(
      { name: 't', projectId: 'p', expiresInDays: 30 }
    );
    expect(createTokenBodySchema.safeParse({ name: '', projectId: 'p' }).success).toBe(false);
    expect(createTokenBodySchema.safeParse({ name: 't' }).success).toBe(false);
  });
});

describe('benchmarkSchemas', () => {
  it('getBenchmarksQuerySchema defaults sort to timestamp desc', () => {
    expect(getBenchmarksQuerySchema.parse({})).toEqual({ sortBy: 'timestamp', order: -1 });
    expect(getBenchmarksQuerySchema.safeParse({ sortBy: 'fps' }).success).toBe(false);
    expect(getBenchmarkStatsQuerySchema.parse({ training_uuid: 'u' }).training_uuid).toBe('u');
  });

  it('createBenchmarkBodySchema coerces dates and tolerates extra system_info keys', () => {
    const parsed = createBenchmarkBodySchema.parse({
      timestamp: '2026-01-01T00:00:00Z',
      system_info: { cpu_count: 8, cpu_count_logical: 16, memory_total_gb: 64, gpu_name: 'A100' },
      results: [{ fps: 30 }],
      epoch: '3',
    });
    expect(parsed.timestamp).toBeInstanceOf(Date);
    expect(parsed.epoch).toBe(3);
    expect((parsed.system_info as Record<string, unknown>).gpu_name).toBe('A100');

    expect(
      createBenchmarkBodySchema.safeParse({ timestamp: 'now', system_info: {}, results: [] }).success
    ).toBe(false);
    expect(updateBenchmarkBodySchema.parse({}).timestamp).toBeUndefined();
  });
});

describe('comparisonSchemas', () => {
  it('getComparisonsQuerySchema validates type and defaults sorting', () => {
    expect(getComparisonsQuerySchema.parse({})).toEqual({ sortBy: 'updatedAt', order: -1 });
    expect(getComparisonsQuerySchema.safeParse({ type: 'nonsense' }).success).toBe(false);
    expect(getComparisonStatsQuerySchema.parse({ type: 'tests' }).type).toBe('tests');
  });

  it('createComparisonBodySchema enforces type and 1..50 items', () => {
    expect(
      createComparisonBodySchema.safeParse({ name: 'C', type: 'trainings', itemIds: ['a'] }).success
    ).toBe(true);
    expect(
      createComparisonBodySchema.safeParse({ name: 'C', type: 'trainings', itemIds: [] }).success
    ).toBe(false);
    expect(
      createComparisonBodySchema.safeParse({ name: 'C', type: 'bogus', itemIds: ['a'] }).success
    ).toBe(false);
    expect(updateComparisonBodySchema.parse({}).name).toBeUndefined();
  });
});

describe('configSchemas', () => {
  it('getAllConfigsQuerySchema defaults to createdAt desc', () => {
    expect(getAllConfigsQuerySchema.parse({})).toEqual({ sortBy: 'createdAt', order: -1 });
  });

  it('createConfigBodySchema rejects null summary/config_data', () => {
    expect(createConfigBodySchema.safeParse({ summary: 's', config_data: {} }).success).toBe(true);
    expect(createConfigBodySchema.safeParse({ summary: null, config_data: {} }).success).toBe(false);
    expect(createConfigBodySchema.safeParse({ summary: 's' }).success).toBe(false);
  });

  it('createConfigFromJsonBodySchema normalizes Summary casing with a fallback', () => {
    expect(createConfigFromJsonBodySchema.parse({ config_data: {}, Summary: 'CAP' }).summary).toBe('CAP');
    expect(createConfigFromJsonBodySchema.parse({ config_data: {}, summary: 'low' }).summary).toBe('low');
    expect(createConfigFromJsonBodySchema.parse({ config_data: {} }).summary).toBe('Config');
  });
});

describe('datasetImageSchemas', () => {
  it('getAllImagesQuerySchema defaults paging', () => {
    expect(getAllImagesQuerySchema.parse({})).toEqual({ page: 1, limit: 50 });
  });

  it('getImagesByDatasetQuerySchema joins repeated tags back together', () => {
    const parsed = getImagesByDatasetQuerySchema.parse({ tags: ['a', 'b'] });
    expect(parsed.tags).toBe('a b');
    expect(parsed.sortBy).toBe('updatedAt');
    expect(parsed.sortOrder).toBe('desc');
  });

  it('createDatasetImageBodySchema requires the full metadata set', () => {
    const valid = {
      filename: 'f.jpg',
      originalName: 'o.jpg',
      fileId: 'm',
      datasetId: 'd',
      categoryId: 'c',
      mimetype: 'image/jpeg',
      size: '123',
    };
    const parsed = createDatasetImageBodySchema.parse(valid);
    expect(parsed.size).toBe(123);
    expect(parsed.tags).toEqual([]);
    expect(parsed.labels).toEqual([]);

    expect(createDatasetImageBodySchema.safeParse({ ...valid, filename: '' }).success).toBe(false);
  });

  it('createDatasetImageBodySchema rejects the removed legacy minioFileId key', () => {
    const base = {
      filename: 'f.jpg',
      originalName: 'o.jpg',
      datasetId: 'd',
      categoryId: 'c',
      mimetype: 'image/jpeg',
      size: 123,
    };

    // minioFileId is no longer translated into fileId, so it no longer satisfies it.
    expect(createDatasetImageBodySchema.safeParse({ ...base, minioFileId: 'legacy' }).success).toBe(false);

    // Missing fileId entirely is likewise a validation failure.
    expect(createDatasetImageBodySchema.safeParse(base).success).toBe(false);

    const parsed = createDatasetImageBodySchema.parse({ ...base, fileId: 'current' });
    expect(parsed.fileId).toBe('current');
  });

  it('updateImageBodySchema allows nullable categoryId', () => {
    expect(updateImageBodySchema.parse({ categoryId: null }).categoryId).toBeNull();
    expect(exportImageNamesQuerySchema.parse({ tag: ['t1', 't2'] }).tag).toBe('t1');
  });
});

describe('datasetSchemas', () => {
  it('getDatasetsQuerySchema defaults page/limit/sort', () => {
    expect(getDatasetsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      sortBy: 'updatedAt',
      order: -1,
    });
  });

  it('createDatasetBodySchema requires a name', () => {
    expect(createDatasetBodySchema.safeParse({ name: ' D ' }).success).toBe(true);
    expect(createDatasetBodySchema.safeParse({ name: '  ' }).success).toBe(false);
  });
});

describe('epochSchemas', () => {
  it('getEpochsByTrainingQuerySchema defaults to epoch asc', () => {
    expect(getEpochsByTrainingQuerySchema.parse({})).toEqual({ sortBy: 'epoch', order: 1 });
  });

  it('createEpochBodySchema requires ids and non-null results', () => {
    expect(
      createEpochBodySchema.safeParse({
        trainingId: 't',
        training_uuid: 'u',
        epoch: '1',
        results: { loss: 0.1 },
      }).success
    ).toBe(true);
    expect(
      createEpochBodySchema.safeParse({ trainingId: 't', training_uuid: 'u', epoch: 1 }).success
    ).toBe(false);
    expect(updateEpochBodySchema.parse({ learning_rate: '0.01' }).learning_rate).toBe(0.01);
  });

  it('createEpochFromJsonBodySchema accepts either trainingId or training_uuid', () => {
    expect(
      createEpochFromJsonBodySchema.safeParse({ training_uuid: 'u', epoch: 1, results: {} }).success
    ).toBe(true);
    expect(
      createEpochFromJsonBodySchema.safeParse({ trainingId: 't', epoch: 1, results: {} }).success
    ).toBe(true);
    expect(createEpochFromJsonBodySchema.safeParse({ epoch: 1, results: {} }).success).toBe(false);
  });

  it('createEpochsBatchBodySchema requires a non-empty batch', () => {
    expect(createEpochsBatchBodySchema.safeParse({ epochs: [] }).success).toBe(false);
    expect(
      createEpochsBatchBodySchema.safeParse({
        epochs: [{ trainingId: 't', training_uuid: 'u', epoch: 1, results: {} }],
      }).success
    ).toBe(true);
  });
});

describe('imageCategorySchemas', () => {
  it('requires name and datasetId on create, all optional on update', () => {
    expect(createImageCategoryBodySchema.safeParse({ name: 'N', datasetId: 'd' }).success).toBe(true);
    expect(createImageCategoryBodySchema.safeParse({ name: 'N' }).success).toBe(false);
    expect(updateCategoryBodySchema.parse({}).name).toBeUndefined();
    expect(updateCategoryBodySchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('projectSchemas', () => {
  it('getProjectsQuerySchema defaults sorting', () => {
    expect(getProjectsQuerySchema.parse({})).toEqual({ sortBy: 'createdAt', sortOrder: -1 });
  });

  it('createProjectBodySchema defaults isPublic to false and coerces it', () => {
    expect(createProjectBodySchema.parse({ name: 'P' }).isPublic).toBe(false);
    expect(createProjectBodySchema.parse({ name: 'P', isPublic: 'true' }).isPublic).toBe(true);
    expect(createProjectBodySchema.safeParse({}).success).toBe(false);
  });

  it('updateProjectBodySchema does not coerce isPublic', () => {
    expect(updateProjectBodySchema.safeParse({ isPublic: 'yes' }).success).toBe(false);
    expect(updateProjectBodySchema.parse({ slug: 's' }).slug).toBe('s');
  });
});

describe('testResultSchemas', () => {
  it('getTestResultsQuerySchema splits comma-separated epoch_uuids', () => {
    const parsed = getTestResultsQuerySchema.parse({ epoch_uuids: 'a, b,c' });
    expect(parsed.epoch_uuids).toEqual(['a', 'b', 'c']);
    expect(parsed.sortBy).toBe('timestamp');
    expect(getTestResultsQuerySchema.parse({}).epoch_uuids).toBeUndefined();
    expect(getTestResultsByEpochUuidQuerySchema.parse({}).order).toBe(-1);
  });

  it('createTestResultBodySchema requires epoch, epoch_uuid, and results', () => {
    expect(
      createTestResultBodySchema.safeParse({ epoch: '1', epoch_uuid: 'e', test_results: {} }).success
    ).toBe(true);
    expect(createTestResultBodySchema.safeParse({ epoch: 1, epoch_uuid: 'e' }).success).toBe(false);
    expect(updateTestResultBodySchema.parse({ epoch: '2' }).epoch).toBe(2);
  });

  it('compare schemas bound their id lists', () => {
    expect(compareTestResultsBodySchema.safeParse({ testResultIds: [] }).success).toBe(false);
    expect(
      compareTestResultsBodySchema.safeParse({ testResultIds: Array(21).fill('x') }).success
    ).toBe(false);
    expect(compareAggregatedTestResultsBodySchema.safeParse({ trainingIds: ['t'] }).success).toBe(true);
  });
});

describe('trainingSchemas', () => {
  it('normalizes tags from comma-string or repeated params', () => {
    expect(getTrainingsQuerySchema.parse({ tags: 'a, b,,c' }).tags).toEqual(['a', 'b', 'c']);
    expect(getTrainingsQuerySchema.parse({ tags: ['x', ' y '] }).tags).toEqual(['x', 'y']);
    expect(getTrainingsQuerySchema.parse({}).tags).toBeUndefined();
    expect(getTrainingsQuerySchema.parse({ tags: ' , ' }).tags).toBeUndefined();
    expect(getTrainingStatsQuerySchema.parse({ tags: 'a' }).tags).toEqual(['a']);
  });

  it('getTrainingWithEpochsQuerySchema defaults to epoch asc', () => {
    expect(getTrainingWithEpochsQuerySchema.parse({})).toEqual({ sortBy: 'epoch', order: 1 });
  });

  it('createTrainingBodySchema defaults status to pending', () => {
    expect(createTrainingBodySchema.parse({ name: 'T' }).status).toBe('pending');
    expect(createTrainingBodySchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateTrainingBodySchema.parse({ startTime: '2026-01-01' }).startTime).toBeInstanceOf(Date);
  });

  it('compareTrainingsBodySchema bounds ids to 1..30', () => {
    expect(compareTrainingsBodySchema.safeParse({ trainingIds: [] }).success).toBe(false);
    expect(
      compareTrainingsBodySchema.safeParse({ trainingIds: Array(31).fill('x') }).success
    ).toBe(false);
  });
});

describe('visualizationSchemas', () => {
  it('upload-url body requires all four fields', () => {
    expect(
      getVisualizationUploadUrlBodySchema.safeParse({
        epoch_uuid: 'e',
        filename: 'f',
        type: 't',
        mimetype: 'm',
      }).success
    ).toBe(true);
    expect(
      getVisualizationUploadUrlBodySchema.safeParse({ epoch_uuid: 'e', filename: 'f' }).success
    ).toBe(false);
  });

  it('createVisualizationBodySchema coerces size', () => {
    const parsed = createVisualizationBodySchema.parse({
      epoch_uuid: 'e',
      visualization_uuid: 'v',
      filename: 'f',
      type: 't',
      fileId: 'm',
      mimetype: 'image/png',
      size: '10',
    });
    expect(parsed.size).toBe(10);
  });

  it('createVisualizationBodySchema rejects the removed legacy minioFileId key', () => {
    const result = createVisualizationBodySchema.safeParse({
      epoch_uuid: 'e',
      visualization_uuid: 'v',
      filename: 'f',
      type: 't',
      minioFileId: 'legacy',
      mimetype: 'image/png',
      size: 10,
    });
    expect(result.success).toBe(false);
  });

  it('query schemas apply defaults', () => {
    expect(getVisualizationsByEpochQuerySchema.parse({})).toEqual({});
    expect(getVisualizationsByTrainingQuerySchema.parse({})).toEqual({
      limit: 50,
      page: 1,
      includeUrls: 'true',
    });
    expect(getVisualizationTypesQuerySchema.parse({ training_uuid: 'u' }).training_uuid).toBe('u');
  });
});
