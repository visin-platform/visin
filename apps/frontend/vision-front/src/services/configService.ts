import { visionApi } from '../config/visionApi';
import {
  Config,
  CreateConfigData,
  ApiResponse,
  ConfigsPaginatedResponse
} from '../types';

export const configService = {
  // Get all configs
  async getAllConfigs(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<ConfigsPaginatedResponse> {
    const response = await visionApi.get(`/configs`, { params });
    return response.data as ConfigsPaginatedResponse;
  },

  // Get configs by training
  async getConfigsByTraining(trainingId: string, params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<ConfigsPaginatedResponse> {
    const response = await visionApi.get(`/trainings/${trainingId}/configs`, { params });
    return response.data as ConfigsPaginatedResponse;
  },

  // Get config by ID
  async getConfigById(id: string): Promise<ApiResponse<Config>> {
    const response = await visionApi.get(`/configs/${id}`);
    return response.data as ApiResponse<Config>;
  },

  // Get config by UUID
  async getConfigByUuid(uuid: string): Promise<ApiResponse<Config>> {
    const response = await visionApi.get(`/configs/uuid/${uuid}`);
    return response.data as ApiResponse<Config>;
  },

  // Create config
  async createConfig(configData: CreateConfigData): Promise<ApiResponse<Config>> {
    const response = await visionApi.post('/configs', configData);
    return response.data as ApiResponse<Config>;
  },

  // Upload config from JSON file
  async uploadConfig(configData: CreateConfigData): Promise<ApiResponse<Config>> {
    const response = await visionApi.post('/configs/upload', configData);
    return response.data as ApiResponse<Config>;
  },

  // Create multiple configs (batch)
  async createConfigsBatch(configs: CreateConfigData[]): Promise<ApiResponse<Config[]>> {
    const response = await visionApi.post('/configs/batch', { configs });
    return response.data as ApiResponse<Config[]>;
  }
};
