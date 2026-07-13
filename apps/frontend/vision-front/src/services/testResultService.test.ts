import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { testResultService } from './testResultService';

const mockedApi = vi.mocked(visionApi);

describe('testResultService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTestResults passes params through', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await testResultService.getTestResults({ page: 1, training_uuid: 'u1' });
    expect(mockedApi.get).toHaveBeenCalledWith('/test-results', { params: { page: 1, training_uuid: 'u1' } });
  });

  it('getTestResultById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'tr1' } } });
    const result = await testResultService.getTestResultById('tr1');
    expect(mockedApi.get).toHaveBeenCalledWith('/test-results/tr1');
    expect(result).toEqual({ success: true, data: { _id: 'tr1' } });
  });

  it('getTestResultByTestUuid fetches by test uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'tr1' } } });
    await testResultService.getTestResultByTestUuid('test-uuid');
    expect(mockedApi.get).toHaveBeenCalledWith('/test-results/test/test-uuid');
  });

  it('getTestResultsByEpochUuid scopes to epoch uuid', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await testResultService.getTestResultsByEpochUuid('epoch-uuid', { page: 1 });
    expect(mockedApi.get).toHaveBeenCalledWith('/epochs/uuid/epoch-uuid/test-results', { params: { page: 1 } });
  });

  it('createTestResult posts test result data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'tr1' } } });
    await testResultService.createTestResult({ epoch: 1 } as any);
    expect(mockedApi.post).toHaveBeenCalledWith('/test-results', { epoch: 1 });
  });

  it('uploadTestResult posts to /test-results/upload', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    await testResultService.uploadTestResult({ raw: true });
    expect(mockedApi.post).toHaveBeenCalledWith('/test-results/upload', { raw: true });
  });

  it('updateTestResult puts partial data', async () => {
    mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
    await testResultService.updateTestResult('tr1', { epoch: 2 } as any);
    expect(mockedApi.put).toHaveBeenCalledWith('/test-results/tr1', { epoch: 2 });
  });

  it('deleteTestResult deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await testResultService.deleteTestResult('tr1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/test-results/tr1');
  });

  it('getTestResultEpochs fetches the epochs list', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { epochs: [1, 2, 3] } } });
    const result = await testResultService.getTestResultEpochs();
    expect(mockedApi.get).toHaveBeenCalledWith('/test-results/epochs');
    expect(result.data.epochs).toEqual([1, 2, 3]);
  });

  it('compareTestResults posts testResultIds', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { comparison: [], summary: {} } } });
    await testResultService.compareTestResults(['a', 'b']);
    expect(mockedApi.post).toHaveBeenCalledWith('/test-results/compare', { testResultIds: ['a', 'b'] });
  });

  it('compareAggregatedTestResultsByTraining posts trainingIds', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { comparison: [] } } });
    await testResultService.compareAggregatedTestResultsByTraining(['t1', 't2']);
    expect(mockedApi.post).toHaveBeenCalledWith('/test-results/compare/aggregated', { trainingIds: ['t1', 't2'] });
  });
});
