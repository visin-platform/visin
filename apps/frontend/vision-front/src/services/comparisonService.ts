import { visionApi } from '../config/visionApi';
import {
  Comparison,
  CreateComparisonData,
  UpdateComparisonData,
  ApiResponse,
  PaginatedResponse
} from '../types';

export interface ComparisonStats {
  totalComparisons: number;
  byType: Array<{
    _id: string;
    count: number;
    avgItemCount: number;
    maxItemCount: number;
    minItemCount: number;
  }>;
  filters: {
    type: string | null;
  };
}

export const comparisonService = {
  // Get all comparisons
  async getComparisons(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Comparison>> {
    const response = await visionApi.get('/comparisons', { params });
    return response.data;
  },

  // Get comparison by ID
  async getComparisonById(id: string): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.get(`/comparisons/${id}`);
    return response.data;
  },

  // Get comparison by UUID
  async getComparisonByUuid(uuid: string): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.get(`/comparisons/uuid/${uuid}`);
    return response.data;
  },

  // Get comparison statistics
  async getComparisonStats(params?: {
    type?: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  }): Promise<ApiResponse<ComparisonStats>> {
    const response = await visionApi.get('/comparisons/stats', { params });
    return response.data;
  },

  // Create comparison
  async createComparison(comparisonData: CreateComparisonData): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.post('/comparisons', comparisonData);
    return response.data;
  },

  // Update comparison
  async updateComparison(id: string, comparisonData: UpdateComparisonData): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.put(`/comparisons/${id}`, comparisonData);
    return response.data;
  },

  // Delete comparison
  async deleteComparison(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/comparisons/${id}`);
    return response.data;
  }
};