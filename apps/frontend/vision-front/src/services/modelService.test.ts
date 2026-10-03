import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/visionApi', () => ({ visionApi: { get: vi.fn(), patch: vi.fn() } }));

import { visionApi } from '../config/visionApi';
import { modelService } from './modelService';

describe('modelService', () => {
  it('asks for the registry with the filters and unwraps the page', async () => {
    const page = { models: [], pagination: { page: 1, limit: 30, total: 0, pages: 0 } };
    vi.mocked(visionApi.get).mockResolvedValue({ data: { success: true, data: page } });
    expect(await modelService.list({ projectId: 'p1', metric: 'val.loss', direction: 'min', sortBy: 'best' })).toEqual(page);
    expect(visionApi.get).toHaveBeenCalledWith('/models', {
      params: { projectId: 'p1', metric: 'val.loss', direction: 'min', sortBy: 'best' }
    });
  });

  it('fetches a run’s model card for a repo and epoch', async () => {
    vi.mocked(visionApi.get).mockResolvedValue({ data: { success: true, data: { readme: '# card' } } });
    expect(await modelService.card('t1', { repo: 'acme/m', epoch: 3 })).toBe('# card');
    expect(visionApi.get).toHaveBeenLastCalledWith('/trainings/t1/model-card', { params: { repo: 'acme/m', epoch: 3 } });
  });

  it('links and unlinks a demo Space on a model', async () => {
    vi.mocked(visionApi.patch).mockResolvedValue({ data: { success: true, data: [{ _id: 'm1', space: 'acme/demo' }] } });
    expect(await modelService.setDemo('t1', 'm1', 'acme/demo')).toEqual([{ _id: 'm1', space: 'acme/demo' }]);
    expect(visionApi.patch).toHaveBeenLastCalledWith('/trainings/t1/models/m1', { space: 'acme/demo' });
    await modelService.setDemo('t1', 'm1', null);
    expect(visionApi.patch).toHaveBeenLastCalledWith('/trainings/t1/models/m1', { space: null });
  });
});
