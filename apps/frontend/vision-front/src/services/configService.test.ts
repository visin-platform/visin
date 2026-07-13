import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { configService } from './configService';

const mockedApi = vi.mocked(visionApi);

describe('configService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAllConfigs passes params through', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await configService.getAllConfigs({ page: 1, limit: 10 });
    expect(mockedApi.get).toHaveBeenCalledWith('/configs', { params: { page: 1, limit: 10 } });
  });

  it('getConfigsByTraining scopes to training id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await configService.getConfigsByTraining('t1', { page: 1 });
    expect(mockedApi.get).toHaveBeenCalledWith('/trainings/t1/configs', { params: { page: 1 } });
  });

  it('getConfigById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'c1' } } });
    await configService.getConfigById('c1');
    expect(mockedApi.get).toHaveBeenCalledWith('/configs/c1');
  });

  it('getConfigByUuid fetches by uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'c1' } } });
    await configService.getConfigByUuid('uuid-1');
    expect(mockedApi.get).toHaveBeenCalledWith('/configs/uuid/uuid-1');
  });

  it('createConfig posts config data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    await configService.createConfig({ name: 'cfg' } as any);
    expect(mockedApi.post).toHaveBeenCalledWith('/configs', { name: 'cfg' });
  });

  it('uploadConfig posts to /configs/upload', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    await configService.uploadConfig({ raw: true });
    expect(mockedApi.post).toHaveBeenCalledWith('/configs/upload', { raw: true });
  });

  it('createConfigsBatch posts array wrapped as configs', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: [] } });
    await configService.createConfigsBatch([{ name: 'a' } as any, { name: 'b' } as any]);
    expect(mockedApi.post).toHaveBeenCalledWith('/configs/batch', { configs: [{ name: 'a' }, { name: 'b' }] });
  });

  it('updateConfig puts partial data', async () => {
    mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
    await configService.updateConfig('c1', { name: 'updated' } as any);
    expect(mockedApi.put).toHaveBeenCalledWith('/configs/c1', { name: 'updated' });
  });

  it('deleteConfig deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await configService.deleteConfig('c1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/configs/c1');
  });
});
