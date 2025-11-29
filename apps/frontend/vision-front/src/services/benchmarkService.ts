import { visionApi } from '../config/visionApi';
import {
  Benchmark,
  CreateBenchmarkData,
  ApiResponse,
  BenchmarksPaginatedResponse
} from '../types';

// Benchmark statistics interface
export interface BenchmarkStats {
  totalBenchmarks: number;
  totalResults: number;
  avgParameters: number;
  avgFlops: number;
  avgFps: number;
  avgMemoryUsage: number;
}

export const benchmarkService = {
  // Get all benchmarks
  async getBenchmarks(params?: {
    page?: number;
    limit?: number;
    training_uuid?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<BenchmarksPaginatedResponse> {
    const response = await visionApi.get('/benchmarks', { params });
    return response.data;
  },

  // Get benchmark by ID
  async getBenchmarkById(id: string): Promise<ApiResponse<Benchmark>> {
    const response = await visionApi.get(`/benchmarks/${id}`);
    return response.data;
  },

  // Get benchmark statistics
  async getBenchmarkStats(params?: {
    training_uuid?: string;
  }): Promise<ApiResponse<BenchmarkStats>> {
    const response = await visionApi.get('/benchmarks/stats', { params });
    return response.data;
  },

  // Create benchmark
  async createBenchmark(benchmarkData: CreateBenchmarkData): Promise<ApiResponse<Benchmark>> {
    const response = await visionApi.post('/benchmarks', benchmarkData);
    return response.data;
  },

  // Upload benchmark from JSON file
  async uploadBenchmark(benchmarkData: any): Promise<ApiResponse<Benchmark>> {
    const response = await visionApi.post('/benchmarks/upload', benchmarkData);
    return response.data;
  },

  // Update benchmark
  async updateBenchmark(id: string, benchmarkData: Partial<CreateBenchmarkData>): Promise<ApiResponse<Benchmark>> {
    const response = await visionApi.put(`/benchmarks/${id}`, benchmarkData);
    return response.data;
  },

  // Delete benchmark
  async deleteBenchmark(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/benchmarks/${id}`);
    return response.data;
  }
};