import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { datasetService } from './datasetService';

const mockedApi = vi.mocked(visionApi);

describe('datasetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDatasets passes params through', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await datasetService.getDatasets({ page: 1, search: 'q' });
    expect(mockedApi.get).toHaveBeenCalledWith('/datasets', { params: { page: 1, search: 'q' } });
  });

  it('getDatasetsFromAnalysis calls /analysis with params', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [] } });
    await datasetService.getDatasetsFromAnalysis({ limit: 5, skip: 0 });
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis', { params: { limit: 5, skip: 0 } });
  });

  it('createDataset posts dataset data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'd1' } } });
    await datasetService.createDataset({ name: 'ds' });
    expect(mockedApi.post).toHaveBeenCalledWith('/datasets', { name: 'ds' });
  });

  it('getDatasetById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'd1' } } });
    const result = await datasetService.getDatasetById('d1');
    expect(mockedApi.get).toHaveBeenCalledWith('/datasets/d1');
    expect(result).toEqual({ success: true, data: { _id: 'd1' } });
  });

  it('getDatasetByUuid fetches by uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'd1' } } });
    await datasetService.getDatasetByUuid('uuid-1');
    expect(mockedApi.get).toHaveBeenCalledWith('/datasets/uuid/uuid-1');
  });

  it('downloadDataset returns data.data with downloadUrl', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { downloadUrl: 'http://x', expiresAt: 'later' } } });
    const result = await datasetService.downloadDataset('uuid-1');
    expect(mockedApi.get).toHaveBeenCalledWith('/datasets/download/uuid-1');
    expect(result).toEqual({ downloadUrl: 'http://x', expiresAt: 'later' });
  });
});
