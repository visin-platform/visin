import {
  ShapeError,
  benchmarksResponseSchema,
  comparisonResponseSchema,
  dashboardStatsSchema,
  parseResponse,
  projectsResponseSchema,
  testResultsResponseSchema,
  trainingWithEpochsSchema,
  trainingsResponseSchema
} from '../schemas';

describe('parseResponse', () => {
  it('returns the parsed value when the shape matches', () => {
    const parsed = parseResponse(projectsResponseSchema, '/projects', [
      { _id: 'p1', name: 'Roadside', isPublic: true }
    ]);

    expect(parsed[0].name).toBe('Roadside');
  });

  it('names the offending field when the contract has changed', () => {
    // The whole point: a drift surfaces as a message someone can act on, on the
    // first call, rather than as an answer built out of undefined.
    expect(() => parseResponse(trainingsResponseSchema, '/trainings', { trainings: 'nope' })).toThrow(
      ShapeError
    );

    try {
      parseResponse(trainingsResponseSchema, '/trainings', { trainings: 'nope' });
    } catch (error) {
      expect((error as ShapeError).detail).toContain('trainings');
      expect((error as Error).message).toContain('/trainings');
      expect((error as Error).message).toContain('rather than something to retry');
    }
  });

  it('names the root when the whole body is wrong', () => {
    try {
      parseResponse(projectsResponseSchema, '/projects', { not: 'an array' });
    } catch (error) {
      expect((error as ShapeError).detail).toContain('(root)');
    }
  });
});

describe('tolerating what the API actually sends', () => {
  it('keeps a response carrying fields the tools do not read', () => {
    // These endpoints return far more than is rendered; rejecting an unknown
    // field would be a self-inflicted outage on the next unrelated deploy.
    const parsed = parseResponse(projectsResponseSchema, '/projects', [
      { _id: 'p1', name: 'Roadside', isPublic: false, __v: 0, deletedAt: null, ownerId: 'u1' }
    ]);

    expect(parsed).toHaveLength(1);
  });

  it('defaults a missing status and tag list rather than failing the call', () => {
    const parsed = parseResponse(trainingsResponseSchema, '/trainings', {
      trainings: [{ _id: 't1', name: 'run' }]
    });

    expect(parsed.trainings[0].status).toBe('unknown');
    expect(parsed.trainings[0].tags).toEqual([]);
  });

  it('accepts an epoch whose results are whatever that run chose to record', () => {
    const parsed = parseResponse(trainingWithEpochsSchema, '/trainings/t1/epochs', {
      training: { _id: 't1', name: 'run', status: 'completed' },
      epochs: [{ epoch: 1, results: { loss: 0.4, custom_metric: 12, note: 'ok' } }]
    });

    expect(parsed.epochs[0].results).toEqual({ loss: 0.4, custom_metric: 12, note: 'ok' });
  });

  it('accepts a run with no epochs recorded yet', () => {
    const parsed = parseResponse(trainingWithEpochsSchema, '/trainings/t1/epochs', {
      training: { _id: 't1', name: 'run', status: 'pending' },
      epochs: []
    });

    expect(parsed.epochs).toEqual([]);
  });

  it('accepts test results both with and without pagination', () => {
    // `/test-results` paginates when asked for a page and reports a bare total
    // when not. Both are real, so both are accepted.
    const paged = parseResponse(testResultsResponseSchema, '/test-results', {
      testResults: [],
      pagination: { page: 1, limit: 5, total: 0, pages: 0 }
    });
    const unpaged = parseResponse(testResultsResponseSchema, '/test-results', {
      testResults: [],
      total: 0
    });

    expect(paged.testResults).toEqual([]);
    expect(unpaged.total).toBe(0);
  });

  it('parses a condition that is summary scalars rather than per-class objects', () => {
    // Real shape: the weather conditions break down by class, but the
    // top-level `overall` maps straight to numbers. Demanding objects
    // everywhere failed the whole parse on that one key — and the `.catch({})`
    // that used to sit here turned the failure into an empty result, so the
    // tool printed a header with no rows and looked uninteresting, not broken.
    const parsed = parseResponse(testResultsResponseSchema, '/test-results', {
      testResults: [
        {
          _id: 'tr1',
          epoch: 99,
          test_results: {
            day_fair: {
              vehicle: { iou: 0.65, precision: 0.66, recall: 0.98, f1_score: 0.79, ap: 0.88 },
              overall: { mIoU_foreground: 0.57, fw_iou: 0.64, confusion_matrix: [[1, 2], [3, 4]] }
            },
            overall: { mIoU_foreground: 0.55, mean_accuracy: 0.93 }
          }
        }
      ]
    });

    const conditions = parsed.testResults[0].test_results;
    expect(Object.keys(conditions)).toEqual(['day_fair', 'overall']);
    expect(conditions.overall.mIoU_foreground).toBe(0.55);
    expect(conditions.day_fair.vehicle).toMatchObject({ iou: 0.65 });
  });

  it('raises rather than emptying when test_results is genuinely the wrong shape', () => {
    // No `.catch` here on purpose: a schema this permissive failing means the
    // contract really moved, and that should be a named error, not silence.
    expect(() =>
      parseResponse(testResultsResponseSchema, '/test-results', {
        testResults: [{ _id: 'tr1', test_results: 'not an object at all' }]
      })
    ).toThrow(ShapeError);
  });

  it('defaults a row that carries no test_results at all', () => {
    const parsed = parseResponse(testResultsResponseSchema, '/test-results', {
      testResults: [{ _id: 'tr1', epoch: 1 }]
    });

    expect(parsed.testResults[0].test_results).toEqual({});
  });

  it('parses a nested per-class test result', () => {
    const parsed = parseResponse(testResultsResponseSchema, '/test-results', {
      testResults: [
        {
          _id: 'tr1',
          epoch: 40,
          test_results: { night: { car: { iou: 0.81, f1_score: 0.77 } } }
        }
      ]
    });

    // The union means a caller narrows before reading a score, exactly as the
    // renderer does — a condition entry may be a number.
    expect(parsed.testResults[0].test_results.night.car).toMatchObject({ iou: 0.81 });
  });

  it('parses dashboard stats, defaulting a total the aggregation left out', () => {
    const parsed = parseResponse(dashboardStatsSchema, '/dashboard-stats', {
      trainingStats: { totalTrainings: 3, totalEpochs: 120 },
      testResultsCount: 4,
      visualizationsCount: 0,
      benchmarksCount: 1
    });

    expect(parsed.trainingStats.totalTime).toBe(0);
    expect(parsed.trainingStats.totalTrainings).toBe(3);
  });

  it('parses a benchmark with only some measurements present', () => {
    const parsed = parseResponse(benchmarksResponseSchema, '/benchmarks', {
      benchmarks: [
        {
          _id: 'b1',
          system_info: { gpu_name: 'RTX 4090' },
          results: [{ model_name: 'yolo', fps: 91.2 }]
        }
      ]
    });

    expect(parsed.benchmarks[0].results[0].fps).toBe(91.2);
    expect(parsed.benchmarks[0].results[0].flops_giga).toBeUndefined();
  });

  it('parses a comparison whose entries have no last epoch', () => {
    const parsed = parseResponse(comparisonResponseSchema, '/trainings/compare', {
      comparison: [
        {
          training: { _id: 't1', name: 'run', status: 'pending' },
          metrics: { totalEpochs: 0, totalTime: 0, avgEpochTime: 0 },
          lastEpoch: null,
          testResultsCount: 0,
          benchmarks: []
        }
      ],
      summary: { totalTrainings: 1 }
    });

    expect(parsed.comparison[0].lastEpoch).toBeNull();
  });
});
