import { MAX_PAGE_SIZE, paginationSchema, sortOrderSchema, looseStringParam } from '../../validation/common';
import { createTokenBodySchema } from '../../validation/apiTokenSchemas';
import {
  createFindingBodySchema,
  listFindingsQuerySchema,
} from '../../validation/findingSchemas';
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
  getEpochsByTrainingQuerySchema,
  createEpochBodySchema,
  updateEpochBodySchema,
  createEpochFromJsonBodySchema,
  createEpochsBatchBodySchema,
} from '../../validation/epochSchemas';
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
    expect(updateComparisonBodySchema.safeParse({ itemIds: Array(50).fill('x') }).success).toBe(true);
    expect(updateComparisonBodySchema.safeParse({ itemIds: Array(51).fill('x') }).success).toBe(false);
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

describe('projectSchemas', () => {
  it('getProjectsQuerySchema defaults sorting', () => {
    expect(getProjectsQuerySchema.parse({})).toEqual({ sortBy: 'createdAt', sortOrder: -1 });
  });

  it('createProjectBodySchema defaults isPublic to false and coerces it', () => {
    expect(createProjectBodySchema.parse({ name: 'P' }).isPublic).toBe(false);
    expect(createProjectBodySchema.parse({ name: 'P', isPublic: 'true' }).isPublic).toBe(true);
    expect(createProjectBodySchema.safeParse({}).success).toBe(false);
  });

  it('createProjectBodySchema accepts a taxonomy and rejects a malformed one', () => {
    const ok = createProjectBodySchema.parse({
      name: 'P',
      taxonomy: {
        conditionLabel: 'Site',
        taskType: 'detection',
        conditions: [{ key: 'line_a', label: 'Line A', color: '#1976d2', order: 0 }],
        metrics: [{ key: 'rmse', direction: 'lower', decimals: 3, format: 'number' }]
      }
    });
    expect(ok.taxonomy?.conditions?.[0].key).toBe('line_a');
    expect(ok.taxonomy?.metrics?.[0].direction).toBe('lower');

    // a term with no key would be unaddressable
    expect(
      createProjectBodySchema.safeParse({ name: 'P', taxonomy: { conditions: [{ label: 'x' }] } })
        .success
    ).toBe(false);
    expect(
      createProjectBodySchema.safeParse({ name: 'P', taxonomy: { taskType: 'sorcery' } }).success
    ).toBe(false);
    expect(
      createProjectBodySchema.safeParse({
        name: 'P',
        taxonomy: { metrics: [{ key: 'iou', direction: 'sideways' }] }
      }).success
    ).toBe(false);
    expect(
      createProjectBodySchema.safeParse({ name: 'P', taxonomy: { classes: [{ key: 'c', color: 'red' }] } })
        .success
    ).toBe(false);
  });

  it('a taxonomy never constrains which conditions or classes may be reported', () => {
    // the point of the design: it decorates discovered keys, it does not gate them
    const parsed = createProjectBodySchema.parse({
      name: 'P',
      taxonomy: { conditions: [{ key: 'day_fair' }] }
    });
    expect(parsed.taxonomy?.conditions).toHaveLength(1);
    // and creating a result for some other condition is a different schema entirely
    expect(createProjectBodySchema.safeParse({ name: 'P' }).success).toBe(true);
  });

  it('updateProjectBodySchema lets an update clear the taxonomy and cost rates with null', () => {
    // What the settings screens send when either editor is empty; rejecting it
    // failed the whole save.
    const parsed = updateProjectBodySchema.parse({ name: 'P', taxonomy: null, costing: null });
    expect(parsed.taxonomy).toBeNull();
    expect(parsed.costing).toBeNull();
    expect(
      updateProjectBodySchema.parse({ costing: { cpuRatePerHour: 1, gpuRatePerHour: 2, currency: 'usd' } }).costing
    ).toEqual({ cpuRatePerHour: 1, gpuRatePerHour: 2, currency: 'USD' });
    expect(updateProjectBodySchema.safeParse({ costing: { currency: 'EURO' } }).success).toBe(false);
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

describe('page size caps', () => {
  it('refuses a page larger than MAX_PAGE_SIZE on every list', () => {
    expect(MAX_PAGE_SIZE).toBe(1000);
    for (const schema of [getAllConfigsQuerySchema, getTrainingsQuerySchema, getVisualizationsByTrainingQuerySchema]) {
      expect(schema.safeParse({ limit: MAX_PAGE_SIZE }).success).toBe(true);
      expect(schema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false);
    }
  });
});

describe('trainingSchemas', () => {
  it('reads excluded tags and a bounded list of ids', () => {
    expect(getTrainingsQuerySchema.parse({ excludeTags: 'a,b' }).excludeTags).toEqual(['a', 'b']);
    expect(getTrainingsQuerySchema.parse({ ids: 'x, y' }).ids).toEqual(['x', 'y']);
    expect(getTrainingsQuerySchema.parse({ ids: ['x'] }).ids).toEqual(['x']);
    expect(getTrainingsQuerySchema.parse({ ids: ' , ' }).ids).toBeUndefined();
    expect(getTrainingsQuerySchema.safeParse({ ids: Array(101).fill('x') }).success).toBe(false);
  });

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


describe('findingSchemas', () => {
  it('coerces a limit arriving as a query string', () => {
    expect(listFindingsQuerySchema.parse({ limit: '25' })).toEqual({ limit: 25 });
  });

  it('accepts an empty filter', () => {
    expect(listFindingsQuerySchema.parse({})).toEqual({});
  });

  it('requires a project, a title and a body', () => {
    expect(createFindingBodySchema.safeParse({}).success).toBe(false);
    expect(createFindingBodySchema.safeParse({ project: 'p1', title: 'T' }).success).toBe(false);
    expect(createFindingBodySchema.safeParse({ project: 'p1', title: 'T', body: 'B' }).success).toBe(
      true
    );
  });

  it('refuses an empty title and one that is only whitespace', () => {
    expect(createFindingBodySchema.safeParse({ project: 'p1', title: '', body: 'B' }).success).toBe(false);
    expect(createFindingBodySchema.safeParse({ project: 'p1', title: '   ', body: 'B' }).success).toBe(false);
  });

  it('caps the body, so one bad prompt cannot store an essay forever', () => {
    const tooLong = { project: 'p1', title: 'T', body: 'x'.repeat(20_001) };

    expect(createFindingBodySchema.safeParse(tooLong).success).toBe(false);
  });

  it('caps how many runs one finding may cite', () => {
    const cites = (n: number) => ({
      project: 'p1',
      title: 'T',
      body: 'B',
      trainingIds: Array.from({ length: n }, (_, i) => `t${i}`),
    });

    expect(createFindingBodySchema.safeParse(cites(50)).success).toBe(true);
    expect(createFindingBodySchema.safeParse(cites(51)).success).toBe(false);
  });
});
