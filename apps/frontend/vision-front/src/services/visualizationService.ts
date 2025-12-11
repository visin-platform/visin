import { visionApi } from '../config/visionApi';
import {
  Visualization,
  CreateVisualizationData,
  VisualizationUploadUrlRequest,
  VisualizationUploadUrlResponse,
  ApiResponse,
  PaginatedResponse,
  VisualizationsGroupedResponse
} from '../types';

export const visualizationService = {
  // Get upload URL for visualization
  async getUploadUrl(data: VisualizationUploadUrlRequest): Promise<ApiResponse<VisualizationUploadUrlResponse>> {
    const response = await visionApi.post('/visualizations/upload-url', data);
    return response.data;
  },

  // Upload file to MinIO using signed URL
  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });
  },

  // Create visualization record after upload
  async createVisualization(data: CreateVisualizationData): Promise<ApiResponse<Visualization>> {
    const response = await visionApi.post('/visualizations', data);
    return response.data;
  },

  // Complete upload process (get URL, upload file, create record)
  async uploadVisualization(
    epoch_uuid: string,
    file: File,
    type: string,
    metadata?: Record<string, any>
  ): Promise<ApiResponse<Visualization>> {
    // Step 1: Get upload URL
    const uploadUrlResponse = await this.getUploadUrl({
      epoch_uuid,
      filename: file.name,
      type,
      mimetype: file.type
    });

    const { uploadUrl, visualization_uuid, minioFileId } = uploadUrlResponse.data;

    // Step 2: Upload file to MinIO
    await this.uploadFile(uploadUrl, file);

    // Step 3: Create visualization record
    return await this.createVisualization({
      epoch_uuid,
      visualization_uuid,
      filename: file.name,
      type,
      minioFileId,
      mimetype: file.type,
      size: file.size,
      metadata
    });
  },

  // Get visualizations by epoch UUID
  async getVisualizationsByEpoch(epoch_uuid: string, type?: string): Promise<ApiResponse<{
    visualizations: Visualization[];
    total: number;
  }>> {
    const params = type ? { type } : {};
    const response = await visionApi.get(`/visualizations/epoch/${epoch_uuid}`, { params });
    return response.data;
  },

  // Get visualizations by training UUID
  async getVisualizationsByTraining(
    training_uuid: string,
    params?: {
      type?: string;
      page?: number;
      limit?: number;
      projectId?: string;
      includeUrls?: boolean;
    }
  ): Promise<PaginatedResponse<Visualization> | ApiResponse<VisualizationsGroupedResponse>> {
    const endpoint = training_uuid && training_uuid.trim() !== '' 
      ? `/visualizations/training/${training_uuid}`
      : `/visualizations/training`;
    
    // Convert includeUrls boolean to string for query parameter
    const queryParams: any = params ? { ...params } : {};
    if (queryParams.includeUrls !== undefined) {
      queryParams.includeUrls = queryParams.includeUrls.toString();
    }
    
    const response = await visionApi.get(endpoint, { params: queryParams });
    return response.data;
  },

  // Get visualization by UUID
  async getVisualizationByUuid(visualization_uuid: string): Promise<ApiResponse<Visualization>> {
    const response = await visionApi.get(`/visualizations/${visualization_uuid}`);
    return response.data;
  },

  // Delete visualization
  async deleteVisualization(visualization_uuid: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/visualizations/${visualization_uuid}`);
    return response.data;
  },

  // Get all visualization types
  async getVisualizationTypes(params?: {
    training_uuid?: string;
    epoch_uuid?: string;
  }): Promise<ApiResponse<{ types: string[] }>> {
    const response = await visionApi.get('/visualizations/types', { params });
    return response.data;
  }
};
