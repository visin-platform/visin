import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';
import { Finding, CreateFindingRequest } from '../types/finding';

/**
 * Written analysis. The same endpoint an assistant writes through over MCP, so
 * what the app shows and what a later session reads back cannot drift.
 */
export const findingService = {
  async list(params: { project?: string; training?: string }): Promise<Finding[]> {
    const response = await visionApi.get('/findings', { params });
    return (response.data as ApiResponse<Finding[]>).data;
  },

  async create(request: CreateFindingRequest): Promise<Finding> {
    const response = await visionApi.post('/findings', request);
    return (response.data as ApiResponse<Finding>).data;
  },

  async remove(id: string): Promise<void> {
    await visionApi.delete(`/findings/${id}`);
  }
};
