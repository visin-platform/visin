import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { trainingService } from './trainingService';

const mockedApi = vi.mocked(visionApi);

describe('trainingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTrainings passes params through', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await trainingService.getTrainings({ status: 'running', page: 1 });
    expect(mockedApi.get).toHaveBeenCalledWith('/trainings', { params: { status: 'running', page: 1 } });
  });

  it('getTrainingById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 't1' } } });
    const result = await trainingService.getTrainingById('t1');
    expect(mockedApi.get).toHaveBeenCalledWith('/trainings/t1');
    expect(result).toEqual({ success: true, data: { _id: 't1' } });
  });

  it('getTrainingByUuid fetches by uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 't1' } } });
    await trainingService.getTrainingByUuid('uuid-1');
    expect(mockedApi.get).toHaveBeenCalledWith('/trainings/uuid/uuid-1');
  });

  it('getTrainingWithEpochs fetches with optional sort params', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: {} } });
    await trainingService.getTrainingWithEpochs('t1', { sortBy: 'epoch', order: 'asc' });
    expect(mockedApi.get).toHaveBeenCalledWith('/trainings/t1/epochs', { params: { sortBy: 'epoch', order: 'asc' } });
  });

  it('getTrainingStats passes optional filters', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: {} } });
    await trainingService.getTrainingStats({ status: 'completed' });
    expect(mockedApi.get).toHaveBeenCalledWith('/trainings/stats', { params: { status: 'completed' } });
  });

  it('compareTrainings posts trainingIds', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    await trainingService.compareTrainings(['t1', 't2']);
    expect(mockedApi.post).toHaveBeenCalledWith('/trainings/compare', { trainingIds: ['t1', 't2'] });
  });

  it('createTraining posts training data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 't1' } } });
    await trainingService.createTraining({ name: 'train' } as any);
    expect(mockedApi.post).toHaveBeenCalledWith('/trainings', { name: 'train' });
  });

  it('updateTraining puts partial data', async () => {
    mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
    await trainingService.updateTraining('t1', { name: 'updated' } as any);
    expect(mockedApi.put).toHaveBeenCalledWith('/trainings/t1', { name: 'updated' });
  });

  it('deleteTraining deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await trainingService.deleteTraining('t1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/trainings/t1');
  });
});
