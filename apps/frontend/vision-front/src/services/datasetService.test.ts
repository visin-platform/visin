import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../config/datasetApi', () => ({ datasetApi: api }));
vi.mock('../utils/chunkedUpload', () => ({ uploadToSignedUrl: vi.fn() }));

import * as service from './datasetService';
import { uploadToSignedUrl } from '../utils/chunkedUpload';

describe('datasetService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps list, detail and groups responses, dropping empty query params', async () => {
    api.get.mockResolvedValueOnce({ data: { datasets: [], pagination: {} } });
    await service.listDatasets({ search: '', page: 2 });
    expect(api.get).toHaveBeenLastCalledWith('?page=2');
    api.get.mockResolvedValueOnce({ data: { _id: 'd1' } });
    expect(await service.getDataset('d1')).toEqual({ _id: 'd1' });
    api.get.mockResolvedValueOnce({ data: [{ id: 'g' }] });
    expect(await service.listMyGroups()).toEqual([{ id: 'g' }]);
    api.get.mockResolvedValueOnce({ data: { items: [] } });
    await service.listItems('d1', { stem: '0001', limit: 200 });
    expect(api.get).toHaveBeenLastCalledWith('/d1/items?stem=0001&limit=200');
    api.get.mockResolvedValueOnce({ data: { downloadUrl: 'u', filename: 'f.zip' } });
    expect(await service.getDownloadUrl('d1')).toEqual({ downloadUrl: 'u', filename: 'f.zip' });
    api.get.mockResolvedValueOnce({ data: { datasets: [] } });
    await service.listDatasets();
    expect(api.get).toHaveBeenLastCalledWith('');
  });

  it('creates, edits, deletes, imports and cancels', async () => {
    api.post.mockResolvedValue({ data: { _id: 'd1' } });
    api.patch.mockResolvedValue({ data: { _id: 'd1', name: 'x' } });
    api.delete.mockResolvedValue({ data: { _id: 'd1' } });
    await service.createDataset({ name: 'n', visibility: 'public' });
    expect(api.post).toHaveBeenLastCalledWith('', { name: 'n', visibility: 'public' });
    expect(await service.updateDataset('d1', { name: 'x' })).toMatchObject({ name: 'x' });
    await service.deleteDataset('d1');
    expect(api.delete).toHaveBeenLastCalledWith('/d1');
    await service.startImport('d1', { groups: [{ folder: 'a', group: 'a' }] });
    expect(api.post).toHaveBeenLastCalledWith('/d1/import', { groups: [{ folder: 'a', group: 'a' }] });
    await service.cancelImport('d1');
    expect(api.delete).toHaveBeenLastCalledWith('/d1/import');
    await service.removeGroup('d1', 'lidar png');
    expect(api.delete).toHaveBeenLastCalledWith('/d1/groups/lidar%20png');
    api.put.mockResolvedValue({ data: { _id: 'd1' } });
    await service.setCover('d1', 'i1');
    expect(api.put).toHaveBeenLastCalledWith('/d1/cover', { itemId: 'i1' });
    await service.scanArchive('d1');
    expect(api.post).toHaveBeenLastCalledWith('/d1/archive/scan');
  });

  it('uploads a zip straight to its signed URL between reserving and completing', async () => {
    api.post.mockResolvedValueOnce({ data: { uploadUrl: 'https://files.test/up' } }).mockResolvedValueOnce({ data: { _id: 'd1', archive: {} } });
    const file = new File(['zip'], 'set.zip');
    const onProgress = vi.fn();
    expect(await service.uploadArchive('d1', file, onProgress)).toMatchObject({ _id: 'd1' });
    expect(api.post).toHaveBeenNthCalledWith(1, '/d1/archive/upload-url', { filename: 'set.zip', size: 3, lastModified: file.lastModified });
    expect(uploadToSignedUrl).toHaveBeenCalledWith('https://files.test/up', file, onProgress);
    expect(api.post).toHaveBeenNthCalledWith(2, '/d1/archive/complete');
  });

  it('only finishes a resumed upload whose bytes had all arrived, and discards one', async () => {
    api.post.mockResolvedValueOnce({ data: { uploaded: true, resumed: true } }).mockResolvedValueOnce({ data: { _id: 'd1' } });
    await service.uploadArchive('d1', new File(['zip'], 'set.zip'));
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenLastCalledWith('/d1/archive/complete');
    api.delete.mockResolvedValueOnce({ data: { _id: 'd1' } });
    expect(await service.discardUpload('d1')).toEqual({ _id: 'd1' });
    expect(api.delete).toHaveBeenLastCalledWith('/d1/archive/upload');
  });
});
