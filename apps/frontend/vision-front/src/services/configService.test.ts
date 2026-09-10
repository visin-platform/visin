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
    await configService.createConfig({ summary: 'cfg', config_data: {} });
    expect(mockedApi.post).toHaveBeenCalledWith('/configs', { summary: 'cfg', config_data: {} });
  });

  it('uploadConfig posts to /configs/upload', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    await configService.uploadConfig({ summary: 'uploaded', config_data: { raw: true } });
    expect(mockedApi.post).toHaveBeenCalledWith('/configs/upload', { summary: 'uploaded', config_data: { raw: true } });
  });

  it('createConfigsBatch posts array wrapped as configs', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: [] } });
    await configService.createConfigsBatch([
      { summary: 'a', config_data: {} },
      { summary: 'b', config_data: {} }
    ]);
    expect(mockedApi.post).toHaveBeenCalledWith('/configs/batch', {
      configs: [{ summary: 'a', config_data: {} }, { summary: 'b', config_data: {} }]
    });
  });

  // Configs are read-only once uploaded — vision-service exposes no update or
  // delete route, so the client offers no method that would call one.
  it('exposes no way to update or delete a config', () => {
    expect('updateConfig' in configService).toBe(false);
    expect('deleteConfig' in configService).toBe(false);
  });
});
