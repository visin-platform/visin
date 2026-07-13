import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { benchmarkService } from './benchmarkService';

const mockedApi = vi.mocked(visionApi);

describe('benchmarkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getBenchmarks passes params through', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [], pagination: {} } });
    await benchmarkService.getBenchmarks({ page: 2, limit: 10 });
    expect(mockedApi.get).toHaveBeenCalledWith('/benchmarks', { params: { page: 2, limit: 10 } });
  });

  it('getBenchmarkById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'b1' } } });
    const result = await benchmarkService.getBenchmarkById('b1');
    expect(mockedApi.get).toHaveBeenCalledWith('/benchmarks/b1');
    expect(result).toEqual({ success: true, data: { _id: 'b1' } });
  });

  it('getBenchmarkStats passes optional params', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: {} } });
    await benchmarkService.getBenchmarkStats({ training_uuid: 'u1' });
    expect(mockedApi.get).toHaveBeenCalledWith('/benchmarks/stats', { params: { training_uuid: 'u1' } });
  });

  it('createBenchmark posts benchmark data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'b1' } } });
    await benchmarkService.createBenchmark({ training_uuid: 'u1' } as any);
    expect(mockedApi.post).toHaveBeenCalledWith('/benchmarks', { training_uuid: 'u1' });
  });

  it('uploadBenchmark posts to /benchmarks/upload', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    const benchmarkData = { training_uuid: 'u1' } as any;
    await benchmarkService.uploadBenchmark(benchmarkData);
    expect(mockedApi.post).toHaveBeenCalledWith('/benchmarks/upload', benchmarkData);
  });

  it('updateBenchmark puts partial data', async () => {
    mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
    await benchmarkService.updateBenchmark('b1', { avgFps: 30 } as any);
    expect(mockedApi.put).toHaveBeenCalledWith('/benchmarks/b1', { avgFps: 30 });
  });

  it('deleteBenchmark deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await benchmarkService.deleteBenchmark('b1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/benchmarks/b1');
  });
});
