import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import {
  getCategoriesByDataset,
  getAllCategories,
  getCategoryById,
  createImageCategory,
  updateImageCategory,
  deleteImageCategory
} from './imageCategoryService';

const mockedApi = vi.mocked(visionApi);

describe('imageCategoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCategoriesByDataset returns data.data', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [{ _id: 'c1' }] } });
    const result = await getCategoriesByDataset('ds1');
    expect(mockedApi.get).toHaveBeenCalledWith('/image-categories/dataset/ds1');
    expect(result).toEqual([{ _id: 'c1' }]);
  });

  it('getAllCategories returns data.data', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [] } });
    const result = await getAllCategories();
    expect(mockedApi.get).toHaveBeenCalledWith('/image-categories');
    expect(result).toEqual([]);
  });

  it('getCategoryById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { _id: 'c1' } } });
    const result = await getCategoryById('c1');
    expect(mockedApi.get).toHaveBeenCalledWith('/image-categories/c1');
    expect(result).toEqual({ _id: 'c1' });
  });

  it('createImageCategory posts category data', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: 'c1' } } });
    const result = await createImageCategory({ name: 'cat', datasetId: 'ds1' });
    expect(mockedApi.post).toHaveBeenCalledWith('/image-categories', { name: 'cat', datasetId: 'ds1' });
    expect(result).toEqual({ _id: 'c1' });
  });

  it('updateImageCategory puts partial update data', async () => {
    mockedApi.put.mockResolvedValue({ data: { data: { _id: 'c1', name: 'updated' } } });
    const result = await updateImageCategory('c1', { name: 'updated' });
    expect(mockedApi.put).toHaveBeenCalledWith('/image-categories/c1', { name: 'updated' });
    expect(result).toEqual({ _id: 'c1', name: 'updated' });
  });

  it('deleteImageCategory deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await deleteImageCategory('c1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/image-categories/c1');
  });
});
