import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';

export interface Dataset {
  _id: string;
  uuid?: string;
  name: string;
  dataset?: string; // Alternative field name from analysis endpoint
  description?: string;
  timestamp: string;
  dataset_info?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  camera?: Record<string, unknown>;
  lidar?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetsPaginatedResponse {
  success: boolean;
  data: {
    datasets: Dataset[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

export const datasetService = {
  // Get all datasets
  async getDatasets(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<DatasetsPaginatedResponse> {
    const response = await visionApi.get(`/datasets`, { params });
    return response.data as DatasetsPaginatedResponse;
  },

  // Get datasets from analysis endpoint
  async getDatasetsFromAnalysis(params?: {
    limit?: number;
    skip?: number;
  }): Promise<{ data: Dataset[] }> {
    const response = await visionApi.get(`/analysis`, { params });
    return response.data as { data: Dataset[]; };
  },

  // Create a new dataset
  async createDataset(datasetData: {
    name: string;
    description?: string;
    timestamp?: string;
    dataset_info?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    camera?: Record<string, unknown>;
    lidar?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    downloadUrl?: string;
  }): Promise<ApiResponse<Dataset>> {
    const response = await visionApi.post(`/datasets`, datasetData);
    return response.data as ApiResponse<Dataset>;
  },

  // Get dataset by ID
  async getDatasetById(id: string): Promise<ApiResponse<Dataset>> {
    const response = await visionApi.get(`/datasets/${id}`);
    return response.data as ApiResponse<Dataset>;
  },

  // Get dataset by UUID
  async getDatasetByUuid(uuid: string): Promise<ApiResponse<Dataset>> {
    const response = await visionApi.get(`/datasets/uuid/${uuid}`);
    return response.data as ApiResponse<Dataset>;
  },

  // Download dataset zip file
  async downloadDataset(uuid: string): Promise<{ downloadUrl: string; expiresAt?: string }> {
    const response = await visionApi.get(`/datasets/download/${uuid}`);
    return (response.data as ApiResponse<{ downloadUrl: string; expiresAt?: string }>).data;
  }
};
