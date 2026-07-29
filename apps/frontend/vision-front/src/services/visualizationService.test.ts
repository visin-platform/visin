import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { visualizationService } from './visualizationService';

const mockedApi = vi.mocked(visionApi);

describe('visualizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getUploadUrl posts upload-url request', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { uploadUrl: 'http://x' } } });
    await visualizationService.getUploadUrl({ epoch_uuid: 'e1', filename: 'f.png', type: 'chart', mimetype: 'image/png' });
    expect(mockedApi.post).toHaveBeenCalledWith('/visualizations/upload-url', {
      epoch_uuid: 'e1',
      filename: 'f.png',
      type: 'chart',
      mimetype: 'image/png'
    });
  });

  describe('uploadFile', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('PUTs directly to the signed URL bypassing visionApi', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const file = new File(['x'], 'f.png', { type: 'image/png' });

      await visualizationService.uploadFile('http://signed.example', file);

      expect(fetchMock).toHaveBeenCalledWith('http://signed.example', {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'image/png' }
      });
    });
  });

  it('createVisualization posts visualization data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'v1' } } });
    await visualizationService.createVisualization({ epoch_uuid: 'e1' } as any);
    expect(mockedApi.post).toHaveBeenCalledWith('/visualizations', { epoch_uuid: 'e1' });
  });

  describe('uploadVisualization', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('chains getUploadUrl, uploadFile and createVisualization', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      mockedApi.post
        .mockResolvedValueOnce({
          data: { success: true, data: { uploadUrl: 'http://signed', visualization_uuid: 'vu1', fileId: 'm1' } }
        })
        .mockResolvedValueOnce({ data: { success: true, data: { _id: 'v1' } } });

      const file = new File(['content'], 'chart.png', { type: 'image/png' });
      const result = await visualizationService.uploadVisualization('e1', file, 'chart', { note: 'x' });

      expect(mockedApi.post).toHaveBeenNthCalledWith(1, '/visualizations/upload-url', {
        epoch_uuid: 'e1',
        filename: 'chart.png',
        type: 'chart',
        mimetype: 'image/png'
      });
      expect(fetchMock).toHaveBeenCalledWith('http://signed', expect.objectContaining({ method: 'PUT' }));
      expect(mockedApi.post).toHaveBeenNthCalledWith(2, '/visualizations', {
        epoch_uuid: 'e1',
        visualization_uuid: 'vu1',
        filename: 'chart.png',
        type: 'chart',
        fileId: 'm1',
        mimetype: 'image/png',
        size: file.size,
        metadata: { note: 'x' }
      });
      expect(result).toEqual({ success: true, data: { _id: 'v1' } });
    });
  });

  it('getVisualizationsByEpoch omits type filter when not provided', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { visualizations: [], total: 0 } } });
    await visualizationService.getVisualizationsByEpoch('e1');
    expect(mockedApi.get).toHaveBeenCalledWith('/visualizations/epoch/e1', { params: {} });
  });

  it('getVisualizationsByEpoch includes type filter when provided', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { visualizations: [], total: 0 } } });
    await visualizationService.getVisualizationsByEpoch('e1', 'chart');
    expect(mockedApi.get).toHaveBeenCalledWith('/visualizations/epoch/e1', { params: { type: 'chart' } });
  });

  it('getVisualizationsByTraining uses the training-scoped endpoint when uuid provided', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await visualizationService.getVisualizationsByTraining('t1', { includeUrls: true, page: 1 });
    expect(mockedApi.get).toHaveBeenCalledWith('/visualizations/training/t1', {
      params: { includeUrls: 'true', page: 1 }
    });
  });

  it('getVisualizationsByTraining falls back to the unscoped endpoint for a blank uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await visualizationService.getVisualizationsByTraining('   ');
    expect(mockedApi.get).toHaveBeenCalledWith('/visualizations/training', { params: {} });
  });

  it('getVisualizationByUuid fetches by uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'v1' } } });
    await visualizationService.getVisualizationByUuid('vu1');
    expect(mockedApi.get).toHaveBeenCalledWith('/visualizations/vu1');
  });

  it('deleteVisualization deletes by uuid', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await visualizationService.deleteVisualization('vu1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/visualizations/vu1');
  });

  it('getVisualizationTypes passes optional filters', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { types: [] } } });
    await visualizationService.getVisualizationTypes({ training_uuid: 't1' });
    expect(mockedApi.get).toHaveBeenCalledWith('/visualizations/types', { params: { training_uuid: 't1' } });
  });
});
