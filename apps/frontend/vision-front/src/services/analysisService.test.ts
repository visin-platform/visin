import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import {
  uploadAnalysis,
  createAnalysis,
  editAnalysis,
  getAnalysisDownloadUrl,
  getAllAnalyses,
  getAnalysesByDataset,
  getAnalysisById,
  updateAnalysis,
  deleteAnalysis,
  compareAnalyses
} from './analysisService';
import { CHUNK_BYTES } from '../utils/chunkedUpload';

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

  it('createAnalysis uploads the archive first and posts the returned fileId', async () => {
    mockedApi.post
      .mockResolvedValueOnce({ data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/f.zip' } } })
      .mockResolvedValueOnce({ data: { data: { _id: '1' } } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'my-dataset.zip', { type: 'application/zip' });
    await createAnalysis('my-dataset', file);

    expect(mockedApi.post).toHaveBeenNthCalledWith(1, '/analysis/upload-url', {
      filename: 'my-dataset.zip',
      mimetype: 'application/zip'
    });
    expect(fetchMock).toHaveBeenCalledWith('http://upload', expect.objectContaining({ method: 'PUT' }));
    expect(mockedApi.post).toHaveBeenNthCalledWith(2, '/analysis/upload', {
      dataset: 'my-dataset',
      fileId: 'datasets/uuid/f.zip'
    });
    vi.unstubAllGlobals();
  });

  it('createAnalysis chunks an archive too large for a single proxied PUT', async () => {
    mockedApi.post
      .mockResolvedValueOnce({ data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/big.zip' } } })
      .mockResolvedValueOnce({ data: { data: { _id: '1' } } });

    const file = new File(['x'], 'big.zip', { type: 'application/zip' });
    const total = CHUNK_BYTES + 1;
    Object.defineProperty(file, 'size', { value: total });
    file.slice = vi.fn(() => new Blob(['chunk'])) as unknown as File['slice'];

    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ size: total }) });
    vi.stubGlobal('fetch', fetchMock);

    await createAnalysis('big', file);

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Range']).toBe(`bytes 0-${CHUNK_BYTES - 1}/${total}`);
    expect(mockedApi.post).toHaveBeenNthCalledWith(2, '/analysis/upload', {
      dataset: 'big',
      fileId: 'datasets/uuid/big.zip'
    });
    vi.unstubAllGlobals();
  });

  it('createAnalysis leaves fileId undefined when no file is chosen', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: '1' } } });
    await createAnalysis('my-dataset');
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/upload', { dataset: 'my-dataset', fileId: undefined });
  });

  it('createAnalysis surfaces a failed archive upload instead of creating a record', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/f.zip' } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const file = new File(['x'], 'my-dataset.zip', { type: 'application/zip' });
    await expect(createAnalysis('my-dataset', file)).rejects.toThrow('Failed to upload dataset file');
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('editAnalysis renames without touching the analysis JSON', async () => {
    mockedApi.put.mockResolvedValue({ data: { data: { _id: '1' } } });
    await editAnalysis('1', 'renamed');
    expect(mockedApi.put).toHaveBeenCalledWith('/analysis/1', { dataset: 'renamed', fileId: undefined });
  });

  it('editAnalysis uploads a replacement archive and sends its fileId', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/new.zip' } } });
    mockedApi.put.mockResolvedValue({ data: { data: { _id: '1' } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await editAnalysis('1', 'renamed', new File(['x'], 'new.zip', { type: 'application/zip' }));

    expect(mockedApi.put).toHaveBeenCalledWith('/analysis/1', { dataset: 'renamed', fileId: 'datasets/uuid/new.zip' });
    vi.unstubAllGlobals();
  });

  it('getAnalysisDownloadUrl reads the download endpoint', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { downloadUrl: 'http://signed' } } });
    const result = await getAnalysisDownloadUrl('1');
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis/1/download');
    expect(result).toEqual({ downloadUrl: 'http://signed' });
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
