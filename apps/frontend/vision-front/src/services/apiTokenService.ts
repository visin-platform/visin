import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';

export interface ApiToken {
  _id: string;
  name: string;
  prefix: string;
  projectId: string;
  createdBy: string;
  expiresAt?: string;
  lastUsedAt?: string;
  isActive: boolean;
  createdAt: string;
  token?: string; // Only returned on creation
}

export const apiTokenService = {
  async getTokens(projectId: string): Promise<ApiResponse<ApiToken[]>> {
    const response = await visionApi.get(`/api-tokens/project/${projectId}`);
    return response.data;
  },

  async createToken(data: { name: string; projectId: string; expiresInDays?: number }): Promise<ApiResponse<ApiToken>> {
    const response = await visionApi.post('/api-tokens', data);
    return response.data;
  },

  async revokeToken(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/api-tokens/${id}`);
    return response.data;
  }
};
