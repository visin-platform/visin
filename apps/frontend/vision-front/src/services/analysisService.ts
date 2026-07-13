import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';

export interface AnalysisResponse {
  data: DatasetAnalysis[];
  pagination: {
    total: number;
    limit: number;
    skip: number;
  };
}

export interface DatasetAnalysis {
  _id: string;
  dataset: string;
  size?: string;
  // Optional to reflect legacy records predating the `data` wrapper, where
  // the JSON payload lived at the document's top level instead.
  data?: Record<string, unknown>;
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisComparisonResponse {
  success: boolean;
  data: {
    comparison: Array<{
      analysis: {
        _id: string;
        dataset: string;
        createdAt: string;
        updatedAt: string;
      };
      data: Record<string, unknown>; // Dynamic JSON data
    }>;
    summary: {
      totalAnalyses: number;
      datasets: string[];
    };
  };
}

/**
 * Upload analysis JSON data
 */
export const uploadAnalysis = async (analysisData: Record<string, unknown>): Promise<DatasetAnalysis> => {
  const response = await visionApi.post('/analysis/upload', analysisData);
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Create new dataset analysis (without data initially)
 */
export const createAnalysis = async (datasetName: string, downloadUrl?: string, size?: string): Promise<DatasetAnalysis> => {
  const body: { dataset: string; downloadUrl?: string; size?: string } = { dataset: datasetName };
  if (downloadUrl) {
    body.downloadUrl = downloadUrl;
  }
  if (size) {
    body.size = size;
  }

  const response = await visionApi.post('/analysis/upload', body);
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Get all analyses
 */
export const getAllAnalyses = async (
  limit: number = 50,
  skip: number = 0,
  dataset?: string
): Promise<AnalysisResponse> => {
  const params: Record<string, unknown> = { limit, skip };
  if (dataset) {
    params.dataset = dataset;
  }

  const response = await visionApi.get('/analysis', { params });
  return response.data as AnalysisResponse;
};

/**
 * Get analyses by dataset name
 */
export const getAnalysesByDataset = async (
  datasetName: string,
  limit: number = 50,
  skip: number = 0
): Promise<AnalysisResponse> => {
  const response = await visionApi.get(`/analysis/dataset/${datasetName}`, { params: { limit, skip } });
  return response.data as AnalysisResponse;
};

/**
 * Get analysis by ID
 */
export const getAnalysisById = async (id: string): Promise<DatasetAnalysis> => {
  const response = await visionApi.get(`/analysis/${id}`);
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Update analysis by ID
 */
export const updateAnalysis = async (id: string, analysisData: Record<string, unknown>): Promise<DatasetAnalysis> => {
  const response = await visionApi.put(`/analysis/${id}`, analysisData);
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Delete analysis by ID
 */
export const deleteAnalysis = async (id: string): Promise<void> => {
  await visionApi.delete(`/analysis/${id}`);
};

/**
 * Compare multiple analyses
 */
export const compareAnalyses = async (analysisIds: string[]): Promise<AnalysisComparisonResponse> => {
  const response = await visionApi.post('/analysis/compare', { analysisIds });
  return response.data as AnalysisComparisonResponse;
};
