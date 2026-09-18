jest.mock('../http', () => ({
  ...jest.requireActual('../http'),
  callService: jest.fn()
}));

import { callService } from '../http';
import { ShapeError } from '../schemas';
import { datasets } from '../datasets';

const called = callService as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATASET_INTERNAL_URL = 'http://dataset-service:5010';
});

afterAll(() => delete process.env.DATASET_INTERNAL_URL);

describe('datasets client', () => {
  it('lists through dataset-service with the forwarded key, from the first page', async () => {
    called.mockResolvedValue({ datasets: [{ _id: 'd1', name: 'ZOD' }], pagination: { total: 1 } });

    const result = await datasets.list('vsn_live_abc', { limit: 30, search: 'zod' });

    expect(called).toHaveBeenCalledWith('http://dataset-service:5010', 'vsn_live_abc', 'GET', '/datasets', undefined, { page: 1, limit: 30, search: 'zod' });
    expect(result.datasets[0]).toMatchObject({ name: 'ZOD', groups: [], imageCount: 0 });
  });

  it('escapes the id and parses one dataset', async () => {
    called.mockResolvedValue({ _id: 'd1', name: 'ZOD', imageCount: 3, groups: [{ name: 'frames', images: 3, jsons: 0 }] });

    const dataset = await datasets.get('k', 'a/b');

    expect(called.mock.calls[0][3]).toBe('/datasets/a%2Fb');
    expect(dataset.groups).toHaveLength(1);
  });

  it('refuses a response that is not a dataset', async () => {
    called.mockResolvedValue({ name: 'no id' });
    await expect(datasets.get('k', 'd1')).rejects.toBeInstanceOf(ShapeError);
  });

  it('falls back to the public address', async () => {
    delete process.env.DATASET_INTERNAL_URL;
    process.env.DATASET_SERVICE_URL = 'https://dataset-api.example.com/';
    called.mockResolvedValue({ datasets: [] });
    await datasets.list('k', {});
    expect(called.mock.calls[0][0]).toBe('https://dataset-api.example.com');
    delete process.env.DATASET_SERVICE_URL;
  });
});
