import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import {
  getAllImages,
  getImagesByDataset,
  getImagesByCategory,
  getImageById,
  createDatasetImage,
  updateDatasetImage,
  deleteDatasetImage,
  getUploadSignedUrl,
  uploadFileToSignedUrl,
  getLabelingStats
} from './datasetImageService';

const mockedApi = vi.mocked(visionApi);

describe('datasetImageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAllImages defaults page to 1 and converts random to string when true', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { images: [], pagination: {} } } });
    await getAllImages(undefined, 10, 'search', 'tag1', true, 'day_fair');
    expect(mockedApi.get).toHaveBeenCalledWith('/dataset-images', {
      params: { page: 1, limit: 10, search: 'search', tags: 'tag1', random: 'true', weatherCondition: 'day_fair' }
    });
  });

  it('getAllImages leaves random undefined when false', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { images: [], pagination: {} } } });
    await getAllImages(2);
    expect(mockedApi.get).toHaveBeenCalledWith('/dataset-images', {
      params: { page: 2, limit: undefined, search: undefined, tags: undefined, random: undefined, weatherCondition: undefined }
    });
  });

  it('getImagesByDataset scopes to dataset id with all params', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { images: [], pagination: {} } } });
    await getImagesByDataset('ds1', 1, 20, 'q', 'cat1', 'tag', 'snow', 'filename', 'asc');
    expect(mockedApi.get).toHaveBeenCalledWith('/dataset-images/dataset/ds1', {
      params: { page: 1, limit: 20, search: 'q', categoryId: 'cat1', tags: 'tag', weatherCondition: 'snow', sortBy: 'filename', sortOrder: 'asc' }
    });
  });

  it('getImagesByCategory joins labels array with commas', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { images: [], pagination: {} } } });
    await getImagesByCategory('ds1', 'cat1', 1, 10, 'q', ['good', 'bad']);
    expect(mockedApi.get).toHaveBeenCalledWith('/dataset-images/dataset/ds1/category/cat1', {
      params: { page: 1, limit: 10, search: 'q', labels: 'good,bad' }
    });
  });

  it('getImagesByCategory omits labels param when empty array', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { images: [], pagination: {} } } });
    await getImagesByCategory('ds1', 'cat1', 1, 10, 'q', []);
    expect(mockedApi.get).toHaveBeenCalledWith('/dataset-images/dataset/ds1/category/cat1', {
      params: { page: 1, limit: 10, search: 'q', labels: undefined }
    });
  });

  it('getImageById returns data.data', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { _id: 'img1' } } });
    const result = await getImageById('img1');
    expect(mockedApi.get).toHaveBeenCalledWith('/dataset-images/img1');
    expect(result).toEqual({ _id: 'img1' });
  });

  it('createDatasetImage posts image data and returns data.data', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: 'img1' } } });
    const result = await createDatasetImage({
      filename: 'f.png',
      originalName: 'f.png',
      minioFileId: 'm1',
      datasetId: 'ds1',
      mimetype: 'image/png',
      size: 100
    });
    expect(mockedApi.post).toHaveBeenCalledWith('/dataset-images', expect.objectContaining({ filename: 'f.png' }));
    expect(result).toEqual({ _id: 'img1' });
  });

  it('updateDatasetImage puts partial update data', async () => {
    mockedApi.put.mockResolvedValue({ data: { data: { _id: 'img1', title: 'new title' } } });
    const result = await updateDatasetImage('img1', { title: 'new title' });
    expect(mockedApi.put).toHaveBeenCalledWith('/dataset-images/img1', { title: 'new title' });
    expect(result).toEqual({ _id: 'img1', title: 'new title' });
  });

  it('deleteDatasetImage calls delete without returning data', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await deleteDatasetImage('img1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/dataset-images/img1');
  });

  it('getUploadSignedUrl posts upload request and returns data.data', async () => {
    mockedApi.post.mockResolvedValue({
      data: { data: { uploadUrl: 'http://x', minioFileId: 'm1', datasetId: 'ds1', expiresInMinutes: 10 } }
    });
    const result = await getUploadSignedUrl({ filename: 'f.png', mimetype: 'image/png', datasetId: 'ds1' });
    expect(mockedApi.post).toHaveBeenCalledWith('/dataset-images/upload-url', {
      filename: 'f.png',
      mimetype: 'image/png',
      datasetId: 'ds1'
    });
    expect(result.uploadUrl).toBe('http://x');
  });

  it('getLabelingStats returns data.data', async () => {
    mockedApi.get.mockResolvedValue({
      data: { data: { total: 10, good: 5, bad: 3, unlabeled: 2, goodPercentage: 50, badPercentage: 30, unlabeledPercentage: 20 } }
    });
    const result = await getLabelingStats();
    expect(mockedApi.get).toHaveBeenCalledWith('/datasets/labeling-stats');
    expect(result.total).toBe(10);
  });

  describe('uploadFileToSignedUrl', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('PUTs the file directly to the signed URL bypassing visionApi', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const file = new File(['content'], 'f.png', { type: 'image/png' });

      await uploadFileToSignedUrl('http://signed.example/upload', file);

      expect(fetchMock).toHaveBeenCalledWith('http://signed.example/upload', {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'image/png' }
      });
      expect(mockedApi.put).not.toHaveBeenCalled();
    });

    it('throws when the upload response is not ok', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
      vi.stubGlobal('fetch', fetchMock);
      const file = new File(['content'], 'f.png', { type: 'image/png' });

      await expect(uploadFileToSignedUrl('http://signed.example/upload', file)).rejects.toThrow(
        'Failed to upload file to signed URL'
      );
    });
  });
});
