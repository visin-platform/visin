import { describe, it, expect, vi, beforeEach } from 'vitest';

const { get, config } = vi.hoisted(() => ({
  get: vi.fn(),
  config: { VISION_API_URL: 'https://vision-api.test/', DATASET_API_URL: 'https://dataset-api.test' },
}));

vi.mock('@visin/frontend-core', () => ({
  createApiClient: (options: { baseUrl: () => string }) => ({
    get: (endpoint: string) => get(`${options.baseUrl()}${endpoint}`),
  }),
}));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

import { entryName, exploreApi } from './exploreApi';

beforeEach(() => {
  get.mockReset();
});

describe('exploreApi', () => {
  it('lists projects newest first, keeping only the public ones', async () => {
    get.mockResolvedValue({
      success: true,
      data: [
        { _id: 'p1', visibility: 'public' },
        { _id: 'p2', visibility: 'private' },
      ],
    });

    await expect(exploreApi.projects()).resolves.toEqual([{ _id: 'p1', visibility: 'public' }]);
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/projects?sortBy=updatedAt&sortOrder=desc');
  });

  it("drops a member's own private datasets from the public catalogue", async () => {
    get.mockResolvedValue({
      success: true,
      data: {
        datasets: [
          { _id: 'd1', visibility: 'private' },
          { _id: 'd2', visibility: 'public' },
        ],
      },
    });

    await expect(exploreApi.datasets(24)).resolves.toEqual([{ _id: 'd2', visibility: 'public' }]);
    expect(get).toHaveBeenCalledWith('https://dataset-api.test/api/datasets?limit=24');
  });

  it('reads the top of the recorded leaderboard, verified or not', async () => {
    get.mockResolvedValue({ success: true, data: { direction: 'max', entries: [] } });

    await expect(exploreApi.leaderboard(5)).resolves.toEqual({ direction: 'max', entries: [] });
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/evaluations/leaderboard?verification=all&limit=5');
  });
});

describe('exploreApi without configured services', () => {
  it('calls nothing but a relative path rather than guessing a host', async () => {
    const saved = { ...config };
    delete (config as Record<string, unknown>).VISION_API_URL;
    delete (config as Record<string, unknown>).DATASET_API_URL;
    get.mockResolvedValue({ success: true, data: { datasets: [], direction: 'max', entries: [] } });
    try {
      await exploreApi.datasets(1);
      await exploreApi.leaderboard(1);
      expect(get).toHaveBeenNthCalledWith(1, '/api/datasets?limit=1');
      expect(get).toHaveBeenNthCalledWith(2, '/api/evaluations/leaderboard?verification=all&limit=1');
    } finally {
      Object.assign(config, saved);
    }
  });
});

describe('entryName', () => {
  const base = { rank: 1, evaluationId: 'e1', project: { name: 'P' }, value: 1, verified: false };

  it('pins a Hub model to its commit', () => {
    expect(entryName({ ...base, checkpoint: { kind: 'hf', repo: 'org/model', commit: 'abcdef1234567' } })).toBe(
      'org/model @ abcdef1'
    );
  });

  it('names weights held elsewhere by their label', () => {
    expect(entryName({ ...base, checkpoint: { kind: 'local', label: 'segformer-b2' } })).toBe('segformer-b2');
  });

  it('falls back to the run, then to a plain word', () => {
    expect(entryName({ ...base, run: { name: 'window16' } })).toBe('window16');
    expect(entryName(base)).toBe('Evaluation');
  });
});
