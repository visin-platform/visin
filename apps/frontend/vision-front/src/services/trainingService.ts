import { visionApi } from '../config/visionApi';
import {
  Training,
  CreateTrainingData,
  TrainingWithEpochs,
  ApiResponse,
  TrainingsPaginatedResponse,
  TrainingComparisonResponse
} from '../types';

export interface TrainingStats {
  totalTrainings: number;
  totalTime: number;
  totalEpochs: number;
  avgEpochTime: number;
  /** absent when no project involved has priced its hardware */
  totalCpuCost?: number;
  totalGpuCost?: number;
  totalCost?: number;
  /** ISO code the costs are in; 'MIXED' when they span currencies */
  currency?: string;
  filters: {
    status: string | null;
    datasetId: string | null;
    projectId: string | null;
  };
}

export const trainingService = {
  // Get all trainings
  async getTrainings(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    datasetId?: string;
    projectId?: string;
    tags?: string[];
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<TrainingsPaginatedResponse> {
    const response = await visionApi.get('/trainings', { params });
    return response.data as TrainingsPaginatedResponse;
  },

  // Get training by ID
  async getTrainingById(id: string): Promise<ApiResponse<Training>> {
    const response = await visionApi.get(`/trainings/${id}`);
    return response.data as ApiResponse<Training>;
  },

  // Get training by UUID
  async getTrainingByUuid(uuid: string): Promise<ApiResponse<Training>> {
    const response = await visionApi.get(`/trainings/uuid/${uuid}`);
    return response.data as ApiResponse<Training>;
  },

  // Get training with all epochs
  async getTrainingWithEpochs(id: string, params?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<ApiResponse<TrainingWithEpochs>> {
    const response = await visionApi.get(`/trainings/${id}/epochs`, { params });
    return response.data as ApiResponse<TrainingWithEpochs>;
  },

  // Get training statistics
  async getTrainingStats(params?: {
    status?: 'pending' | 'running' | 'completed' | 'failed';
    datasetId?: string;
    projectId?: string;
    tags?: string[];
  }): Promise<ApiResponse<TrainingStats>> {
    const response = await visionApi.get('/trainings/stats', { params });
    return response.data as ApiResponse<TrainingStats>;
  },

  // Compare multiple trainings
  async compareTrainings(trainingIds: string[]): Promise<ApiResponse<TrainingComparisonResponse>> {
    const response = await visionApi.post('/trainings/compare', { trainingIds });
    return response.data as ApiResponse<TrainingComparisonResponse>;
  },

  // Create training
  async createTraining(trainingData: CreateTrainingData): Promise<ApiResponse<Training>> {
    const response = await visionApi.post('/trainings', trainingData);
    return response.data as ApiResponse<Training>;
  },

  // Update training
  async updateTraining(id: string, trainingData: Partial<CreateTrainingData>): Promise<ApiResponse<Training>> {
    const response = await visionApi.put(`/trainings/${id}`, trainingData);
    return response.data as ApiResponse<Training>;
  },

  // Delete training
  async deleteTraining(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/trainings/${id}`);
    return response.data as ApiResponse<void>;
  }
};
