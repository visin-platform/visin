import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { testResultService } from './testResultService';
import type { CreateTestResultData } from '../types';

const mockedApi = vi.mocked(visionApi);

const evaluation = (over: Record<string, unknown> = {}) => ({
  _id: 'e1',
  uuid: 't-1',
  projectId: 'p1',
  source: { trainingId: 'r1', epochUuid: 'ep-4', epoch: 4 },
  executedAt: '2026-09-30T08:00:00.000Z',
  receivedAt: '2026-10-01T09:00:00.000Z',
  createdAt: '2026-10-01T09:00:00.000Z',
  results: { day: { overall: { iou: 0.7 } } },
  run: { _id: 'r1', name: 'Run', uuid: 'u1', status: 'completed' },
  epochInfo: { epoch: 4, epoch_time: 12 },
  ...over
});
const page = { page: 1, limit: 30, total: 1, pages: 1 };

describe('testResultService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads what runs reported from the evaluations list, with the results, in the shape the pages know', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { evaluations: [evaluation()], pagination: page } } });
    const response = await testResultService.getTestResults({ page: 1, limit: 30, training_uuid: 'u1', epoch_uuids: 'a,b', projectId: 'p1' });
    expect(mockedApi.get).toHaveBeenCalledWith('/evaluations', {
      params: { page: 1, limit: 30, projectId: 'p1', trainingUuid: 'u1', epochUuids: 'a,b', include: 'results' }
    });
    expect(response.data.pagination).toEqual(page);
    expect(response.data.testResults).toEqual([
      {
        _id: 'e1',
        test_uuid: 't-1',
        epoch: 4,
        epoch_uuid: 'ep-4',
        timestamp: '2026-09-30T08:00:00.000Z',
        test_results: { day: { overall: { iou: 0.7 } } },
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
        training: { _id: 'r1', name: 'Run', uuid: 'u1', status: 'completed' },
        epoch_info: { epoch: 4, epoch_time: 12 }
      }
    ]);
  });

  it('asks for no parameters it was not given, and orders only the ways an evaluation list can', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { evaluations: [], pagination: page } } });
    await testResultService.getTestResults();
    expect(mockedApi.get).toHaveBeenLastCalledWith('/evaluations', { params: { include: 'results' } });
    await testResultService.getTestResults({ sortBy: 'timestamp', order: 'asc' });
    expect(mockedApi.get).toHaveBeenLastCalledWith('/evaluations', { params: { order: 'asc', sortBy: 'executedAt', include: 'results' } });
    await testResultService.getTestResults({ sortBy: 'epoch' });
    expect(mockedApi.get).toHaveBeenLastCalledWith('/evaluations', { params: { sortBy: 'epoch', include: 'results' } });
    await testResultService.getTestResults({ sortBy: 'createdAt' });
    expect(mockedApi.get).toHaveBeenLastCalledWith('/evaluations', { params: { include: 'results' } });
  });

  it('falls back to when it was stored, to its epoch info, and to no run, for a result that lacks them', async () => {
    mockedApi.get.mockResolvedValue({
      data: { success: true, data: { evaluations: [evaluation({ source: undefined, executedAt: undefined, run: undefined, epochInfo: undefined, results: undefined })], pagination: page } }
    });
    const [result] = (await testResultService.getTestResults()).data.testResults;
    expect(result).toMatchObject({ epoch: 0, epoch_uuid: '', timestamp: '2026-10-01T09:00:00.000Z', test_results: {} });
    expect(result).not.toHaveProperty('training');
    expect(result).not.toHaveProperty('epoch_info');
  });

  it('records an uploaded result file as an evaluation of its epoch, under its own uuid', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    const data: CreateTestResultData = { epoch: 3, epoch_uuid: 'ep-3', test_uuid: 't-3', timestamp: '2026-10-01T00:00:00Z', test_results: { overall: { iou: 0.5 } } };
    const result = await testResultService.uploadTestResult(data);
    expect(mockedApi.post).toHaveBeenCalledWith('/evaluations', {
      uuid: 't-3',
      results: { overall: { iou: 0.5 } },
      source: { epochUuid: 'ep-3', epoch: 3 },
      executedAt: '2026-10-01T00:00:00Z'
    });
    expect(result).toEqual({ success: true, data: { _id: 'e1' } });
  });

  it('leaves out the uuid and time a file did not carry, so the server supplies them', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    await testResultService.uploadTestResult({ epoch: 3, epoch_uuid: 'ep-3', test_results: { overall: {} } });
    expect(mockedApi.post).toHaveBeenCalledWith('/evaluations', { results: { overall: {} }, source: { epochUuid: 'ep-3', epoch: 3 } });
  });

  it('moves a result to the trash', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true, data: { _id: 'e1' } } });
    await testResultService.deleteTestResult('e1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/evaluations/e1');
  });
});
