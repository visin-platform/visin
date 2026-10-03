import { visionApi } from '../config/visionApi';
import {
  Comparison,
  CreateComparisonData,
  UpdateComparisonData,
  ApiResponse,
  ComparisonsPaginatedResponse
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

/** Hand a file to the browser to save. */
const saveFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const comparisonService = {
  /** A comparison of trainings as a spreadsheet, built by the server so the file is the same as the API's. */
  async exportTable(id: string, format: 'csv' | 'xlsx'): Promise<void> {
    const { blob, filename } = await visionApi.download(`/comparisons/${id}/export?format=${format}`);
    saveFile(blob, filename ?? `comparison.${format}`);
  },

  // Get all comparisons
  async getComparisons(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
    projectId?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<ComparisonsPaginatedResponse> {
    const response = await visionApi.get('/comparisons', { params });
    return response.data as ComparisonsPaginatedResponse;
  },

  // Get comparison by ID
  async getComparisonById(id: string): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.get(`/comparisons/${id}`);
    return response.data as ApiResponse<Comparison>;
  },

  // Get comparison by UUID
  async getComparisonByUuid(uuid: string): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.get(`/comparisons/uuid/${uuid}`);
    return response.data as ApiResponse<Comparison>;
  },

  // Get comparison statistics
  async getComparisonStats(params?: {
    type?: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
    projectId?: string;
  }): Promise<ApiResponse<ComparisonStats>> {
    const response = await visionApi.get('/comparisons/stats', { params });
    return response.data as ApiResponse<ComparisonStats>;
  },

  // Create comparison
  async createComparison(comparisonData: CreateComparisonData): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.post('/comparisons', comparisonData);
    return response.data as ApiResponse<Comparison>;
  },

  // Update comparison
  async updateComparison(id: string, comparisonData: UpdateComparisonData): Promise<ApiResponse<Comparison>> {
    const response = await visionApi.put(`/comparisons/${id}`, comparisonData);
    return response.data as ApiResponse<Comparison>;
  },

  // Delete comparison
  async deleteComparison(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/comparisons/${id}`);
    return response.data as ApiResponse<void>;
  }
};