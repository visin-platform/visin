import { visionApi } from '../config/visionApi';

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
  data: any; // Dynamic JSON structure
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
      data: any; // Dynamic JSON data
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
export const uploadAnalysis = async (analysisData: any): Promise<DatasetAnalysis> => {
  const response = await visionApi.post('/analysis/upload', analysisData);
  return response.data.data;
};

/**
 * Create new dataset analysis (without data initially)
 */
export const createAnalysis = async (datasetName: string, downloadUrl?: string, size?: string): Promise<DatasetAnalysis> => {
  const body: any = { dataset: datasetName };
  if (downloadUrl) {
    body.downloadUrl = downloadUrl;
  }
  if (size) {
    body.size = size;
  }

  const response = await visionApi.post('/analysis/upload', body);
  return response.data.data;
};

/**
 * Get all analyses
 */
export const getAllAnalyses = async (
  limit: number = 50,
  skip: number = 0,
  dataset?: string
): Promise<AnalysisResponse> => {
  const params: Record<string, any> = { limit, skip };
  if (dataset) {
    params.dataset = dataset;
  }

  const response = await visionApi.get('/analysis', { params });
  return response.data;
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
  return response.data;
};

/**
 * Get analysis by ID
 */
export const getAnalysisById = async (id: string): Promise<DatasetAnalysis> => {
  const response = await visionApi.get(`/analysis/${id}`);
  return response.data.data;
};

/**
 * Update analysis by ID
 */
export const updateAnalysis = async (id: string, analysisData: any): Promise<DatasetAnalysis> => {
  const response = await visionApi.put(`/analysis/${id}`, analysisData);
  return response.data.data;
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
  return response.data;
};
