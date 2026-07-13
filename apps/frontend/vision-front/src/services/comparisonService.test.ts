import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { comparisonService } from './comparisonService';

const mockedApi = vi.mocked(visionApi);

describe('comparisonService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getComparisons passes params through', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await comparisonService.getComparisons({ type: 'trainings', page: 1 });
    expect(mockedApi.get).toHaveBeenCalledWith('/comparisons', { params: { type: 'trainings', page: 1 } });
  });

  it('getComparisonById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'c1' } } });
    const result = await comparisonService.getComparisonById('c1');
    expect(mockedApi.get).toHaveBeenCalledWith('/comparisons/c1');
    expect(result).toEqual({ success: true, data: { _id: 'c1' } });
  });

  it('getComparisonByUuid fetches by uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'c1' } } });
    await comparisonService.getComparisonByUuid('uuid-1');
    expect(mockedApi.get).toHaveBeenCalledWith('/comparisons/uuid/uuid-1');
  });

  it('getComparisonStats passes optional params', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: {} } });
    await comparisonService.getComparisonStats({ type: 'tests' });
    expect(mockedApi.get).toHaveBeenCalledWith('/comparisons/stats', { params: { type: 'tests' } });
  });

  it('createComparison posts comparison data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    await comparisonService.createComparison({ type: 'trainings' } as any);
    expect(mockedApi.post).toHaveBeenCalledWith('/comparisons', { type: 'trainings' });
  });

  it('updateComparison puts data by id', async () => {
    mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
    await comparisonService.updateComparison('c1', { name: 'new' } as any);
    expect(mockedApi.put).toHaveBeenCalledWith('/comparisons/c1', { name: 'new' });
  });

  it('deleteComparison deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await comparisonService.deleteComparison('c1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/comparisons/c1');
  });
});
