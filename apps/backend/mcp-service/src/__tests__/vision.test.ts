jest.mock('../http', () => ({
  ...jest.requireActual('../http'),
  callService: jest.fn()
}));

import { callService } from '../http';
import { ShapeError } from '../schemas';
import { vision } from '../vision';

const called = callService as unknown as jest.Mock;

/** The last call's (method, path, body, query), for readable assertions. */
const lastCall = () => {
  const [base, key, method, path, body, query] = called.mock.calls[0];
  return { base, key, method, path, body, query };
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VISION_INTERNAL_URL = 'http://vision-service:4010';
});

afterAll(() => delete process.env.VISION_INTERNAL_URL);

describe('routing', () => {
  it('sends every call to vision-service with the forwarded key', async () => {
    called.mockResolvedValue([]);

    await vision.listProjects('vsn_live_abc');

    expect(lastCall()).toMatchObject({
      base: 'http://vision-service:4010',
      key: 'vsn_live_abc',
      method: 'GET',
      path: '/projects'
    });
  });

  it('escapes an identifier rather than pasting it into the path', async () => {
    // A slug is user-supplied; a stray slash would silently address a different
    // endpoint.
    called.mockResolvedValue({ _id: 'p1', name: 'x' });

    await vision.getProject('k', 'road/side');

    expect(lastCall().path).toBe('/projects/road%2Fside');
  });

  it('asks for epochs in epoch order, which is what a curve needs', async () => {
    called.mockResolvedValue({ training: { _id: 't1', name: 'x' }, epochs: [] });

    await vision.getTrainingWithEpochs('k', 't1');

    expect(lastCall()).toMatchObject({
      path: '/trainings/t1/epochs',
      query: { sortBy: 'epoch', order: 1 }
    });
  });

  it('sends page alongside limit, or the endpoint ignores the limit entirely', async () => {
    // testResultService only paginates when it has both. Given `limit` alone it
    // returned all 989 rows — 3 MB, 164,000 tokens — for a request asking for
    // five. The pairing is sent on every list call, not just this one.
    called.mockResolvedValue({ testResults: [] });

    await vision.listTestResults('k', { limit: 5 });

    expect(lastCall().query).toMatchObject({ page: 1, limit: 5 });
  });

  it('lets a caller override the page rather than pinning it to the first', async () => {
    called.mockResolvedValue({ testResults: [] });

    await vision.listTestResults('k', { page: 3, limit: 5 });

    expect(lastCall().query).toMatchObject({ page: 3 });
  });

  it('posts a comparison as a body, not a query string', async () => {
    called.mockResolvedValue({ comparison: [] });

    await vision.compareTrainings('k', ['t1', 't2']);

    expect(lastCall()).toMatchObject({
      method: 'POST',
      path: '/trainings/compare',
      body: { trainingIds: ['t1', 't2'] }
    });
  });

  it('sends an update as a PUT', async () => {
    called.mockResolvedValue({ _id: 't1', name: 'x', status: 'completed', tags: [] });

    await vision.updateTraining('k', 't1', { name: 'x' });

    expect(lastCall()).toMatchObject({ method: 'PUT', path: '/trainings/t1' });
  });

  it('scopes a category lookup to its dataset', async () => {
    called.mockResolvedValue([]);

    await vision.listImageCategories('k', 'd1');

    expect(lastCall().path).toBe('/image-categories/dataset/d1');
  });

  it.each([
    [
      'getDashboardStats',
      () => vision.getDashboardStats('k', 'roadside'),
      {
        trainingStats: {
          totalTrainings: 0,
          totalTime: 0,
          totalEpochs: 0,
          avgEpochTime: 0,
          totalCpuCost: 0,
          totalGpuCost: 0,
          totalCost: 0
        },
        testResultsCount: 0,
        visualizationsCount: 0,
        benchmarksCount: 0
      },
      { method: 'GET', path: '/projects/roadside/dashboard-stats' }
    ],
    [
      'getTraining',
      () => vision.getTraining('k', 't1'),
      { _id: 't1', name: 'run' },
      { method: 'GET', path: '/trainings/t1' }
    ],
    [
      'listTestResults',
      () => vision.listTestResults('k', { trainingId: 't1' }),
      { testResults: [] },
      { method: 'GET', path: '/test-results', query: { trainingId: 't1' } }
    ],
    [
      'listBenchmarks',
      () => vision.listBenchmarks('k', { training_id: 't1' }),
      { benchmarks: [] },
      { method: 'GET', path: '/benchmarks', query: { training_id: 't1' } }
    ],
    [
      'listDatasets',
      () => vision.listDatasets('k', { limit: 30 }),
      { datasets: [] },
      { method: 'GET', path: '/datasets', query: { limit: 30 } }
    ],
    [
      'getDataset',
      () => vision.getDataset('k', 'd1'),
      { _id: 'd1', name: 'Highway' },
      { method: 'GET', path: '/datasets/d1' }
    ],
    [
      'listVisualizations',
      () => vision.listVisualizations('k', { training_uuid: 't-uuid', limit: 20 }),
      { visualizations: [] },
      { method: 'GET', path: '/visualizations/training', query: { page: 1, training_uuid: 't-uuid', limit: 20 } }
    ],
    [
      'listVisualizationTypes',
      () => vision.listVisualizationTypes('k', 't-uuid'),
      { types: ['overlay'] },
      { method: 'GET', path: '/visualizations/types', query: { training_uuid: 't-uuid' } }
    ],
    [
      'getVisualization',
      () => vision.getVisualization('k', 'v1'),
      { visualization_uuid: 'v1', type: 'overlay' },
      { method: 'GET', path: '/visualizations/v1' }
    ],
    [
      'createProject',
      () => vision.createProject('k', { name: 'Roadside' }),
      { _id: 'p1', name: 'Roadside' },
      { method: 'POST', path: '/projects', body: { name: 'Roadside' } }
    ],
    [
      'updateProject',
      () => vision.updateProject('k', 'p1', { name: 'Renamed' }),
      { _id: 'p1', name: 'Renamed' },
      { method: 'PUT', path: '/projects/p1', body: { name: 'Renamed' } }
    ]
  ])('routes %s to the right verb and path', async (_name, invoke, payload, expected) => {
    called.mockResolvedValue(payload);

    await invoke();

    expect(lastCall()).toMatchObject(expected);
  });
});

describe('parsing at the boundary', () => {
  it('returns the parsed value when the service answers as expected', async () => {
    called.mockResolvedValue({
      trainings: [{ _id: 't1', name: 'baseline', status: 'completed' }],
      pagination: { total: 1 }
    });

    const { trainings } = await vision.listTrainings('k', {});

    expect(trainings[0].name).toBe('baseline');
    expect(trainings[0].tags).toEqual([]);
  });

  it('raises a ShapeError naming the path when the contract has drifted', async () => {
    // Rather than building an answer from undefined and reporting it as fact.
    called.mockResolvedValue({ trainings: { not: 'an array' } });

    await expect(vision.listTrainings('k', {})).rejects.toBeInstanceOf(ShapeError);
    await expect(vision.listTrainings('k', {})).rejects.toThrow('/trainings');
  });

  it('raises a ShapeError on a bad single-object response too', async () => {
    called.mockResolvedValue({ name: 'missing an id' });

    await expect(vision.getProject('k', 'p1')).rejects.toBeInstanceOf(ShapeError);
  });
});
