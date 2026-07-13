import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import {
  uploadAnalysis,
  createAnalysis,
  getAllAnalyses,
  getAnalysesByDataset,
  getAnalysisById,
  updateAnalysis,
  deleteAnalysis,
  compareAnalyses
} from './analysisService';

const mockedApi = vi.mocked(visionApi);

describe('analysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploadAnalysis posts to /analysis/upload and returns data.data', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: '1', dataset: 'd' } } });
    const result = await uploadAnalysis({ foo: 'bar' });
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/upload', { foo: 'bar' });
    expect(result).toEqual({ _id: '1', dataset: 'd' });
  });

  it('createAnalysis includes downloadUrl and size when provided', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: '1' } } });
    await createAnalysis('my-dataset', 'http://x', '10MB');
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/upload', {
      dataset: 'my-dataset',
      downloadUrl: 'http://x',
      size: '10MB'
    });
  });

  it('createAnalysis omits downloadUrl/size when not provided', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: '1' } } });
    await createAnalysis('my-dataset');
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/upload', { dataset: 'my-dataset' });
  });

  it('getAllAnalyses defaults limit/skip and omits dataset when absent', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, limit: 50, skip: 0 } } });
    await getAllAnalyses();
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis', { params: { limit: 50, skip: 0 } });
  });

  it('getAllAnalyses includes dataset filter when provided', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, limit: 10, skip: 5 } } });
    await getAllAnalyses(10, 5, 'my-ds');
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis', { params: { limit: 10, skip: 5, dataset: 'my-ds' } });
  });

  it('getAnalysesByDataset calls the dataset-scoped endpoint', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, limit: 50, skip: 0 } } });
    await getAnalysesByDataset('my-ds', 20, 0);
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis/dataset/my-ds', { params: { limit: 20, skip: 0 } });
  });

  it('getAnalysisById returns data.data', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { _id: '1' } } });
    const result = await getAnalysisById('1');
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis/1');
    expect(result).toEqual({ _id: '1' });
  });

  it('updateAnalysis puts to /analysis/:id and returns data.data', async () => {
    mockedApi.put.mockResolvedValue({ data: { data: { _id: '1', dataset: 'updated' } } });
    const result = await updateAnalysis('1', { dataset: 'updated' });
    expect(mockedApi.put).toHaveBeenCalledWith('/analysis/1', { dataset: 'updated' });
    expect(result).toEqual({ _id: '1', dataset: 'updated' });
  });

  it('deleteAnalysis calls delete on /analysis/:id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await deleteAnalysis('1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/analysis/1');
  });

  it('compareAnalyses posts analysisIds and returns data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { comparison: [], summary: { totalAnalyses: 0, datasets: [] } } } });
    const result = await compareAnalyses(['a', 'b']);
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/compare', { analysisIds: ['a', 'b'] });
    expect(result.success).toBe(true);
  });
});
