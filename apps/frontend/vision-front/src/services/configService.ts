import { visionApi } from '../config/visionApi';
import {
  Config,
  CreateConfigData,
  ApiResponse,
  PaginatedResponse
} from '../types';

export const configService = {
  // Get all configs
  async getAllConfigs(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Config>> {
    const response = await visionApi.get(`/configs`, { params });
    return response.data;
  },

  // Get configs by training
  async getConfigsByTraining(trainingId: string, params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Config>> {
    const response = await visionApi.get(`/configs/training/${trainingId}`, { params });
    return response.data;
  },

  // Get config by ID
  async getConfigById(id: string): Promise<ApiResponse<Config>> {
    const response = await visionApi.get(`/configs/${id}`);
    return response.data;
  },

  // Get config by UUID
  async getConfigByUuid(uuid: string): Promise<ApiResponse<Config>> {
    const response = await visionApi.get(`/configs/uuid/${uuid}`);
    return response.data;
  },

  // Create config
  async createConfig(configData: CreateConfigData): Promise<ApiResponse<Config>> {
    const response = await visionApi.post('/configs', configData);
    return response.data;
  },

  // Upload config from JSON file
  async uploadConfig(configData: any): Promise<ApiResponse<Config>> {
    const response = await visionApi.post('/configs/upload', configData);
    return response.data;
  },

  // Create multiple configs (batch)
  async createConfigsBatch(configs: CreateConfigData[]): Promise<ApiResponse<Config[]>> {
    const response = await visionApi.post('/configs/batch', { configs });
    return response.data;
  },

  // Update config
  async updateConfig(id: string, configData: Partial<CreateConfigData>): Promise<ApiResponse<Config>> {
    const response = await visionApi.put(`/configs/${id}`, configData);
    return response.data;
  },

  // Delete config
  async deleteConfig(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/configs/${id}`);
    return response.data;
  }
};
