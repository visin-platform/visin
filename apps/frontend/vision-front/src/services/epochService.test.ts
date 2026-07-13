import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { epochService } from './epochService';
import type { CreateEpochData } from '../types';

const mockedApi = vi.mocked(visionApi);

const baseEpochData: CreateEpochData = {
  trainingId: 't1',
  training_uuid: 'training-uuid-1',
  epoch: 1,
  results: {}
};

describe('epochService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getEpochsByTraining scopes to training id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await epochService.getEpochsByTraining('t1', { page: 1 });
    expect(mockedApi.get).toHaveBeenCalledWith('/epochs/training/t1', { params: { page: 1 } });
  });

  it('getEpochById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    await epochService.getEpochById('e1');
    expect(mockedApi.get).toHaveBeenCalledWith('/epochs/e1');
  });

  it('getEpochByUuid fetches by uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    await epochService.getEpochByUuid('uuid-1');
    expect(mockedApi.get).toHaveBeenCalledWith('/epochs/uuid/uuid-1');
  });

  it('createEpoch posts epoch data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    await epochService.createEpoch(baseEpochData);
    expect(mockedApi.post).toHaveBeenCalledWith('/epochs', baseEpochData);
  });

  it('uploadEpoch merges trainingId into payload when provided', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    await epochService.uploadEpoch(baseEpochData, 't1');
    expect(mockedApi.post).toHaveBeenCalledWith('/epochs/upload', { ...baseEpochData, trainingId: 't1' });
  });

  it('uploadEpoch sends payload unmodified without trainingId', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    await epochService.uploadEpoch(baseEpochData);
    expect(mockedApi.post).toHaveBeenCalledWith('/epochs/upload', baseEpochData);
  });

  it('createEpochsBatch wraps epochs array', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: [] } });
    await epochService.createEpochsBatch([baseEpochData]);
    expect(mockedApi.post).toHaveBeenCalledWith('/epochs/batch', { epochs: [baseEpochData] });
  });

  it('updateEpoch puts partial data', async () => {
    mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
    await epochService.updateEpoch('e1', { epoch: 2 });
    expect(mockedApi.put).toHaveBeenCalledWith('/epochs/e1', { epoch: 2 });
  });

  it('deleteEpoch deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await epochService.deleteEpoch('e1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/epochs/e1');
  });

  describe('uploadOrUpdateEpoch', () => {
    it('updates when payload has an _id', async () => {
      mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
      await epochService.uploadOrUpdateEpoch({ ...baseEpochData, _id: 'e1', epoch: 3 }, 't1');
      expect(mockedApi.put).toHaveBeenCalledWith('/epochs/e1', { ...baseEpochData, _id: 'e1', epoch: 3, trainingId: 't1' });
    });

    it('updates when payload has an epoch_uuid', async () => {
      mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
      await epochService.uploadOrUpdateEpoch({ ...baseEpochData, epoch_uuid: 'uuid-1', epoch: 3 });
      expect(mockedApi.put).toHaveBeenCalledWith('/epochs/uuid-1', { ...baseEpochData, epoch_uuid: 'uuid-1', epoch: 3 });
    });

    it('falls back to uploadEpoch when update fails', async () => {
      mockedApi.put.mockRejectedValue(new Error('not found'));
      mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
      await epochService.uploadOrUpdateEpoch({ ...baseEpochData, _id: 'e1', epoch: 3 }, 't1');
      expect(mockedApi.post).toHaveBeenCalledWith('/epochs/upload', { ...baseEpochData, _id: 'e1', epoch: 3, trainingId: 't1' });
    });

    it('creates a new epoch when payload has no id', async () => {
      mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
      await epochService.uploadOrUpdateEpoch({ ...baseEpochData, epoch: 3 }, 't1');
      expect(mockedApi.post).toHaveBeenCalledWith('/epochs/upload', { ...baseEpochData, epoch: 3, trainingId: 't1' });
      expect(mockedApi.put).not.toHaveBeenCalled();
    });
  });
});
