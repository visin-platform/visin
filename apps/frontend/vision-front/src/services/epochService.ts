import { visionApi } from '../config/visionApi';
import {
  Epoch,
  CreateEpochData,
  ApiResponse,
  EpochsPaginatedResponse
} from '../types';

export type UploadEpochData = CreateEpochData & { _id?: string };

export const epochService = {
  // Get epochs by training
  async getEpochsByTraining(trainingId: string, params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<EpochsPaginatedResponse> {
    const response = await visionApi.get(`/epochs/training/${trainingId}`, { params });
    return response.data as EpochsPaginatedResponse;
  },

  // Get epoch by ID
  async getEpochById(id: string): Promise<ApiResponse<Epoch>> {
    const response = await visionApi.get(`/epochs/${id}`);
    return response.data as ApiResponse<Epoch>;
  },

  // Get epoch by UUID
  async getEpochByUuid(uuid: string): Promise<ApiResponse<Epoch>> {
    const response = await visionApi.get(`/epochs/uuid/${uuid}`);
    return response.data as ApiResponse<Epoch>;
  },

  // Create epoch
  async createEpoch(epochData: CreateEpochData): Promise<ApiResponse<Epoch>> {
    const response = await visionApi.post('/epochs', epochData);
    return response.data as ApiResponse<Epoch>;
  },

  // Upload epoch from JSON file
  async uploadEpoch(epochData: UploadEpochData, trainingId?: string): Promise<ApiResponse<Epoch>> {
    const payload = trainingId 
      ? { ...epochData, trainingId }
      : epochData;
    const response = await visionApi.post('/epochs/upload', payload);
    return response.data as ApiResponse<Epoch>;
  },

  // Create multiple epochs (batch)
  async createEpochsBatch(epochs: CreateEpochData[]): Promise<ApiResponse<Epoch[]>> {
    const response = await visionApi.post('/epochs/batch', { epochs });
    return response.data as ApiResponse<Epoch[]>;
  },

  // Update epoch
  async updateEpoch(id: string, epochData: Partial<CreateEpochData>): Promise<ApiResponse<Epoch>> {
    const response = await visionApi.put(`/epochs/${id}`, epochData);
    return response.data as ApiResponse<Epoch>;
  },

  // Upload or update epoch (smart method)
  async uploadOrUpdateEpoch(epochData: UploadEpochData, trainingId?: string): Promise<ApiResponse<Epoch>> {
    const payload = trainingId 
      ? { ...epochData, trainingId }
      : epochData;

    // Check if epoch has an ID
    const epochId = payload._id || payload.epoch_uuid;

    if (epochId) {
      // Try to update first
      try {
        return await this.updateEpoch(epochId, payload);
      } catch {
        // If update fails (epoch not found), create new
        return await this.uploadEpoch(payload, trainingId);
      }
    } else {
      // No ID, create new epoch
      return await this.uploadEpoch(payload, trainingId);
    }
  },

  // Delete epoch
  async deleteEpoch(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/epochs/${id}`);
    return response.data as ApiResponse<void>;
  }
};
