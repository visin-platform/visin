import { describe, it, expect, vi, beforeEach } from 'vitest';

const { get, config } = vi.hoisted(() => ({
  get: vi.fn(),
  config: { VISION_API_URL: 'https://vision-api.test/', LABEL_SERVICE_URL: 'https://label-api.test' },
}));

vi.mock('@visin/frontend-core', () => ({
  createApiClient: (options: { baseUrl: () => string }) => ({
    get: (endpoint: string) => get(`${options.baseUrl()}${endpoint}`),
  }),
}));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

import { homeApi, remainingTasks } from './homeApi';

beforeEach(() => {
  get.mockReset();
});

describe('homeApi', () => {
  it('asks vision-service for a page of trainings and reports the total across pages', async () => {
    get.mockResolvedValue({ success: true, data: { trainings: [{ _id: 't1' }], pagination: { total: 9 } } });

    await expect(homeApi.trainings({ limit: 5, status: 'running' })).resolves.toEqual({
      trainings: [{ _id: 't1' }],
      total: 9,
    });
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/trainings?limit=5&status=running');
  });

  it('counts the page itself when no pagination comes back', async () => {
    get.mockResolvedValue({ success: true, data: { trainings: [{ _id: 't1' }, { _id: 't2' }] } });

    await expect(homeApi.trainings({ limit: 5 })).resolves.toMatchObject({ total: 2 });
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/trainings?limit=5');
  });

  it('reads projects most recently updated first', async () => {
    get.mockResolvedValue({ success: true, data: [{ _id: 'p1' }] });

    await expect(homeApi.projects()).resolves.toEqual([{ _id: 'p1' }]);
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/projects?sortBy=updatedAt&sortOrder=desc');
  });

  it('reads the newest findings across projects', async () => {
    get.mockResolvedValue({ success: true, data: [{ _id: 'f1' }] });

    await expect(homeApi.findings(4)).resolves.toEqual([{ _id: 'f1' }]);
    expect(get).toHaveBeenCalledWith('https://vision-api.test/api/findings?limit=4');
  });

  it('reads the jobs there is to label from label-service', async () => {
    get.mockResolvedValue({ success: true, data: [{ _id: 'j1' }] });

    await expect(homeApi.jobs()).resolves.toEqual([{ _id: 'j1' }]);
    expect(get).toHaveBeenCalledWith('https://label-api.test/api/jobs?role=worker');
  });
});

describe('remainingTasks', () => {
  const job = { _id: 'j1', name: 'Job', tasksCount: 20, updatedAt: '2026-09-15T00:00:00Z' };

  it('subtracts completed tasks from the progress total', () => {
    expect(remainingTasks({ ...job, progress: { tasks: 100, completed: 40 } })).toBe(60);
  });

  it('counts every task of a job with no progress yet', () => {
    expect(remainingTasks(job)).toBe(20);
  });

  it('never goes below zero', () => {
    expect(remainingTasks({ ...job, progress: { tasks: 10, completed: 12 } })).toBe(0);
  });
});
