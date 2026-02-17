import { visionApi } from '../config/visionApi';
import {
  ApiResponse,
  PaginatedResponse
} from '../types';

export interface Dataset {
  _id: string;
  uuid?: string;
  name: string;
  dataset?: string; // Alternative field name from analysis endpoint
  description?: string;
  timestamp: string;
  dataset_info?: Record<string, any>;
  annotations?: Record<string, any>;
  camera?: Record<string, any>;
  lidar?: Record<string, any>;
  metadata?: Record<string, any>;
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export const datasetService = {
  // Get all datasets
  async getDatasets(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Dataset>> {
    const response = await visionApi.get(`/datasets`, { params });
    return response.data;
  },

  // Get datasets from analysis endpoint
  async getDatasetsFromAnalysis(params?: {
    limit?: number;
    skip?: number;
  }): Promise<{ data: Dataset[] }> {
    const response = await visionApi.get(`/analysis`, { params });
    return response.data;
  },

  // Create a new dataset
  async createDataset(datasetData: {
    name: string;
    description?: string;
    timestamp?: string;
    dataset_info?: Record<string, any>;
    annotations?: Record<string, any>;
    camera?: Record<string, any>;
    lidar?: Record<string, any>;
    metadata?: Record<string, any>;
    downloadUrl?: string;
  }): Promise<ApiResponse<Dataset>> {
    const response = await visionApi.post(`/datasets`, datasetData);
    return response.data;
  },

  // Get dataset by ID
  async getDatasetById(id: string): Promise<ApiResponse<Dataset>> {
    const response = await visionApi.get(`/datasets/${id}`);
    return response.data;
  },

  // Get dataset by UUID
  async getDatasetByUuid(uuid: string): Promise<ApiResponse<Dataset>> {
    const response = await visionApi.get(`/datasets/uuid/${uuid}`);
    return response.data;
  },

  // Download dataset zip file
  async downloadDataset(uuid: string): Promise<{ downloadUrl: string; expiresAt?: string }> {
    const response = await visionApi.get(`/datasets/download/${uuid}`);
    return response.data.data;
  },

  // Get signed URL for a specific MinIO path
  async getSignedUrl(minioPath: string): Promise<{ signedUrl: string; expiresAt: string }> {
    // This would need a backend endpoint to generate signed URLs for arbitrary MinIO paths
    // For now, we'll use the existing download endpoint with a special parameter
    const response = await visionApi.get(`/datasets/signed-url`, { 
      params: { path: minioPath }
    });
    return response.data.data;
  }
};
