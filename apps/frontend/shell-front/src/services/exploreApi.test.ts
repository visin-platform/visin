import { describe, it, expect, vi, beforeEach } from 'vitest';

const { get, config } = vi.hoisted(() => ({
  get: vi.fn(),
  config: {
    VISION_API_URL: 'https://vision-api.test/',
    DATASET_API_URL: 'https://dataset-api.test',
    AUTH_SERVICE_URL: 'https://auth.test/',
    GROUP_SERVICE_URL: 'https://group.test',
  },
}));

vi.mock('@visin/frontend-core', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  createApiClient: (options: { baseUrl: () => string }) => ({
    get: (endpoint: string, init?: unknown) => get(`${options.baseUrl()}${endpoint}`, init),
  }),
}));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

import { ApiError } from '@visin/frontend-core';
import { entryName, exploreApi, type ActivityItem } from './exploreApi';

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
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/projects?sortBy=updatedAt&sortOrder=desc', undefined);
  });

  it('asks the server for a profile’s public datasets, a page at a time, rather than filtering what came back', async () => {
    const page = { datasets: [{ _id: 'd2', visibility: 'public' }], pagination: { page: 2, limit: 24, total: 30, pages: 2 } };
    get.mockResolvedValue({ success: true, data: page });

    await expect(exploreApi.publicDatasets({ page: 2, limit: 24 }, { user: 'u9' })).resolves.toEqual(page);
    expect(get).toHaveBeenCalledWith('https://dataset-api.test/api/datasets?visibility=public&page=2&limit=24&user=u9', { skipAuthRedirect: true });

    await exploreApi.publicDatasets({ page: 1, limit: 24 }, { owner: 'g1' });
    expect(get).toHaveBeenLastCalledWith('https://dataset-api.test/api/datasets?visibility=public&page=1&limit=24&owner=g1', { skipAuthRedirect: true });
  });

  it('searches people with a public page, by the start of a handle or name', async () => {
    const rows = [{ id: 'u1', handle: 'ann-lee', name: 'Ann Lee' }];
    get.mockResolvedValue({ success: true, data: rows });

    await expect(exploreApi.searchPeople('ann lee', 6)).resolves.toEqual(rows);
    expect(get).toHaveBeenCalledWith('https://auth.test/auth/users?q=ann+lee&limit=6', { skipAuthRedirect: true });
  });

  it('searches groups with a public page the same way', async () => {
    const rows = [{ id: 'g1', handle: 'road-lab', name: 'Road lab' }];
    get.mockResolvedValue({ success: true, data: rows });

    await expect(exploreApi.searchGroups('road', 6)).resolves.toEqual(rows);
    expect(get).toHaveBeenCalledWith('https://group.test/api/public/groups?q=road&limit=6', { skipAuthRedirect: true });
  });

  describe('the public catalogue', () => {
    const card = { id: 'p1', name: 'Window ablations', owner: { kind: 'user', id: 'u1' }, createdAt: 'c', updatedAt: 'u', runs: 2, lastRunAt: 'l' };

    it('reads a page of public projects, with the id as _id and visibility stated, so the cards need only one shape', async () => {
      get.mockResolvedValue({ success: true, data: { projects: [card], pagination: { page: 2, limit: 12, total: 13, pages: 2 } } });

      const result = await exploreApi.publicProjects({ search: 'swin', sort: 'created', page: 2, limit: 12 });

      expect(get).toHaveBeenCalledWith(
        'https://vision-api.test/api/public/projects?sort=created&page=2&limit=12&search=swin',
        { skipAuthRedirect: true }
      );
      expect(result.pagination).toEqual({ page: 2, limit: 12, total: 13, pages: 2 });
      expect(result.projects).toEqual([
        { _id: 'p1', name: 'Window ablations', owner: { kind: 'user', id: 'u1' }, createdAt: 'c', updatedAt: 'u', runs: 2, lastRunAt: 'l', visibility: 'public' },
      ]);
    });

    it('leaves the search out when there is none', async () => {
      get.mockResolvedValue({ success: true, data: { projects: [], pagination: { page: 1, limit: 12, total: 0, pages: 0 } } });

      await exploreApi.publicProjects({ sort: 'updated', page: 1, limit: 12 });

      expect(get).toHaveBeenCalledWith('https://vision-api.test/api/public/projects?sort=updated&page=1&limit=12', { skipAuthRedirect: true });
    });

    it('reads a page of public datasets by asking for public ones only', async () => {
      const data = { datasets: [{ _id: 'd1' }], pagination: { page: 1, limit: 12, total: 1, pages: 1 } };
      get.mockResolvedValue({ success: true, data });

      await expect(exploreApi.publicDatasets({ search: 'harbour', page: 1, limit: 12 })).resolves.toEqual(data);
      expect(get).toHaveBeenCalledWith(
        'https://dataset-api.test/api/datasets?visibility=public&page=1&limit=12&search=harbour',
        { skipAuthRedirect: true }
      );

      await exploreApi.publicDatasets({ page: 3, limit: 5 });
      expect(get).toHaveBeenLastCalledWith('https://dataset-api.test/api/datasets?visibility=public&page=3&limit=5', { skipAuthRedirect: true });
    });

    it('reads a page of public papers, by words or by the person who wrote them', async () => {
      const data = { papers: [{ id: 'pa1' }], pagination: { page: 1, limit: 6, total: 1, pages: 1 } };
      get.mockResolvedValue({ success: true, data });

      await expect(exploreApi.publicPapers({ search: 'night', user: 'u1', page: 1, limit: 6 })).resolves.toEqual(data);
      expect(get).toHaveBeenCalledWith('https://vision-api.test/api/public/papers?page=1&limit=6&search=night&user=u1', { skipAuthRedirect: true });

      await exploreApi.publicPapers({ page: 2, limit: 5 });
      expect(get).toHaveBeenLastCalledWith('https://vision-api.test/api/public/papers?page=2&limit=5', { skipAuthRedirect: true });
    });

    it('reads the latest findings of public projects', async () => {
      const rows = [{ id: 'f1', title: 'x' }];
      get.mockResolvedValue({ success: true, data: rows });

      await expect(exploreApi.publicFindings(4)).resolves.toEqual(rows);
      expect(get).toHaveBeenCalledWith('https://vision-api.test/api/public/findings?limit=4', { skipAuthRedirect: true });
    });
  });

  describe('activity', () => {
    const project = { id: 'p1', name: 'Window ablations' };
    const lines = (at: string): ActivityItem[] => [{ kind: 'project.created', at, project }];
    const datasetLine: ActivityItem = { kind: 'dataset.created', at: '2026-09-02T00:00:00Z', dataset: { id: 'd1', name: 'Frames', imageCount: 1 } };

    it('merges what Vision and the dataset service say, newest first, and stops at the limit', async () => {
      get.mockImplementation(async (url: string) => ({
        success: true,
        data: url.includes('/public/activity') ? [...lines('2026-09-03T00:00:00Z'), ...lines('2026-09-01T00:00:00Z')] : [datasetLine],
      }));

      const items = await exploreApi.activity({ user: 'u1' }, 2);

      expect(items.map((item) => item.at)).toEqual(['2026-09-03T00:00:00Z', '2026-09-02T00:00:00Z']);
      expect(get).toHaveBeenCalledWith('https://vision-api.test/api/public/activity?limit=2&user=u1', { skipAuthRedirect: true });
      expect(get).toHaveBeenCalledWith('https://dataset-api.test/api/datasets/activity?limit=2&user=u1', { skipAuthRedirect: true });
    });

    it("asks for a group's by the group's id, thirty lines unless told otherwise", async () => {
      get.mockResolvedValue({ success: true, data: [] });

      await exploreApi.activity({ owner: 'g1' });

      expect(get).toHaveBeenCalledWith('https://vision-api.test/api/public/activity?limit=30&owner=g1', { skipAuthRedirect: true });
    });

    it('is what the other service had when one is down, and an error only when both are', async () => {
      get.mockImplementation(async (url: string) => {
        if (url.includes('/public/activity')) throw new Error('vision down');
        return { success: true, data: [datasetLine] };
      });
      await expect(exploreApi.activity({ user: 'u1' })).resolves.toEqual([datasetLine]);

      get.mockRejectedValue(new Error('both down'));
      await expect(exploreApi.activity({ user: 'u1' })).rejects.toThrow('both down');
    });

    it('asks only the services that are configured, and is empty with none', async () => {
      const saved = { ...config };
      delete (config as Record<string, unknown>).DATASET_API_URL;
      get.mockResolvedValue({ success: true, data: lines('2026-09-03T00:00:00Z') });
      try {
        await exploreApi.activity({ user: 'u1' });
        expect(get).toHaveBeenCalledTimes(1);

        get.mockClear();
        delete (config as Record<string, unknown>).VISION_API_URL;
        await expect(exploreApi.activity({ user: 'u1' })).resolves.toEqual([]);
        expect(get).not.toHaveBeenCalled();
      } finally {
        Object.assign(config, saved);
      }
    });
  });

  it("lists one person's public projects and datasets for their profile", async () => {
    get.mockResolvedValue({ success: true, data: [{ _id: 'p1', visibility: 'public' }] });
    await exploreApi.projects({ user: 'u1' });
    expect(get).toHaveBeenLastCalledWith('https://vision-api.test/api/projects?sortBy=updatedAt&sortOrder=desc&user=u1', undefined);

    get.mockResolvedValue({ success: true, data: { datasets: [] } });
    await exploreApi.publicDatasets({ page: 1, limit: 24 }, { user: 'u1' });
    expect(get).toHaveBeenLastCalledWith('https://dataset-api.test/api/datasets?visibility=public&page=1&limit=24&user=u1', { skipAuthRedirect: true });
  });

  it("lists a group's public projects and datasets by the group's id", async () => {
    get.mockResolvedValue({ success: true, data: [] });
    await exploreApi.projects({ owner: 'g1' });
    expect(get).toHaveBeenLastCalledWith('https://vision-api.test/api/projects?sortBy=updatedAt&sortOrder=desc&owner=g1', undefined);

    get.mockResolvedValue({ success: true, data: { datasets: [] } });
    await exploreApi.publicDatasets({ page: 1, limit: 24 }, { owner: 'g1' });
    expect(get).toHaveBeenLastCalledWith('https://dataset-api.test/api/datasets?visibility=public&page=1&limit=24&owner=g1', { skipAuthRedirect: true });
  });

  it("reads a group's public page by handle, and reads none where the group has none", async () => {
    const page = { id: 'g1', handle: 'road-lab', name: 'Road lab', createdAt: '2026-01-01T00:00:00Z' };
    get.mockResolvedValue({ success: true, data: page });
    await expect(exploreApi.group('road lab')).resolves.toEqual(page);
    expect(get).toHaveBeenCalledWith('https://group.test/api/public/groups/road%20lab', { skipAuthRedirect: true });

    get.mockRejectedValueOnce(new ApiError(404, 'No such group'));
    await expect(exploreApi.group('nobody')).resolves.toBeNull();
    get.mockRejectedValueOnce(new ApiError(500, 'boom'));
    await expect(exploreApi.group('road-lab')).rejects.toThrow('boom');
  });

  it("reads a person's public page by handle, without treating a signed-out answer as a reason to sign in", async () => {
    const page = { id: 'u1', handle: 'ann-lee', name: 'Ann Lee', links: [], createdAt: '2026-01-01T00:00:00Z' };
    get.mockResolvedValue({ success: true, data: page });

    await expect(exploreApi.user('ann lee')).resolves.toEqual(page);
    expect(get).toHaveBeenCalledWith('https://auth.test/auth/users/ann%20lee', { skipAuthRedirect: true });
  });

  it('reads no page for a handle that has none, and lets other failures through', async () => {
    get.mockRejectedValueOnce(new ApiError(404, 'No such user'));
    await expect(exploreApi.user('nobody')).resolves.toBeNull();

    get.mockRejectedValueOnce(new ApiError(500, 'boom'));
    await expect(exploreApi.user('ann')).rejects.toThrow('boom');
    get.mockRejectedValueOnce(new Error('network'));
    await expect(exploreApi.user('ann')).rejects.toThrow('network');
  });

  it('reads the top of the recorded leaderboard, verified or not', async () => {
    get.mockResolvedValue({ success: true, data: { direction: 'max', entries: [] } });

    await expect(exploreApi.leaderboard(5)).resolves.toEqual({ direction: 'max', entries: [] });
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/evaluations/leaderboard?verification=all&limit=5', undefined);
  });
});

describe('exploreApi without configured services', () => {
  it('calls nothing but a relative path rather than guessing a host', async () => {
    const saved = { ...config };
    delete (config as Record<string, unknown>).VISION_API_URL;
    delete (config as Record<string, unknown>).DATASET_API_URL;
    get.mockResolvedValue({ success: true, data: { datasets: [], direction: 'max', entries: [] } });
    try {
      await exploreApi.publicDatasets({ page: 1, limit: 1 });
      await exploreApi.leaderboard(1);
      expect(get).toHaveBeenNthCalledWith(1, '/api/datasets?visibility=public&page=1&limit=1', { skipAuthRedirect: true });
      expect(get).toHaveBeenNthCalledWith(2, '/api/evaluations/leaderboard?verification=all&limit=1', undefined);
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
