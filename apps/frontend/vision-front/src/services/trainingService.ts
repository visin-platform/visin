import { visionApi } from '../config/visionApi';
import {
  Training,
  CreateTrainingData,
  TrainingWithEpochs,
  ApiResponse,
  PaginatedResponse
} from '../types';

// Training comparison types
export interface TrainingComparison {
  training: {
    _id: string;
    name: string;
    description?: string;
    status: Training['status'];
    createdAt: string;
    updatedAt: string;
  };
  metrics: {
    totalEpochs: number;
    totalTime: number;
    avgEpochTime: number;
    maxEpochTime: number;
    cost: {
      totalHours: number;
      cpuCost: number;
      gpuCost: number;
      totalCost: number;
    };
  };
  lastEpoch: {
    epoch: number;
    results: any;
    timestamp: string;
  } | null;
  epochs: Array<{
    epoch: number;
    results: any;
    epoch_time?: number;
    timestamp: string;
  }>;
}

export interface TrainingComparisonResponse {
  comparison: TrainingComparison[];
  summary: {
    totalTrainings: number;
    trainingsWithEpochs: number;
  };
}

export interface TrainingStats {
  totalTrainings: number;
  totalTime: number;
  totalCpuCost: number;
  totalGpuCost: number;
  totalCost: number;
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
  }): Promise<PaginatedResponse<Training>> {
    const response = await visionApi.get('/trainings', { params });
    return response.data;
  },

  // Get training by ID
  async getTrainingById(id: string): Promise<ApiResponse<Training>> {
    const response = await visionApi.get(`/trainings/${id}`);
    return response.data;
  },

  // Get training by UUID
  async getTrainingByUuid(uuid: string): Promise<ApiResponse<Training>> {
    const response = await visionApi.get(`/trainings/uuid/${uuid}`);
    return response.data;
  },

  // Get training with all epochs
  async getTrainingWithEpochs(id: string, params?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<ApiResponse<TrainingWithEpochs>> {
    const response = await visionApi.get(`/trainings/${id}/epochs`, { params });
    return response.data;
  },

  // Get training statistics
  async getTrainingStats(params?: {
    status?: 'pending' | 'running' | 'completed' | 'failed';
    datasetId?: string;
    projectId?: string;
    tags?: string[];
  }): Promise<ApiResponse<TrainingStats>> {
    const response = await visionApi.get('/trainings/stats', { params });
    return response.data;
  },

  // Compare multiple trainings
  async compareTrainings(trainingIds: string[]): Promise<ApiResponse<TrainingComparisonResponse>> {
    const response = await visionApi.post('/trainings/compare', { trainingIds });
    return response.data;
  },

  // Create training
  async createTraining(trainingData: CreateTrainingData): Promise<ApiResponse<Training>> {
    const response = await visionApi.post('/trainings', trainingData);
    return response.data;
  },

  // Update training
  async updateTraining(id: string, trainingData: Partial<CreateTrainingData>): Promise<ApiResponse<Training>> {
    const response = await visionApi.put(`/trainings/${id}`, trainingData);
    return response.data;
  },

  // Delete training
  async deleteTraining(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/trainings/${id}`);
    return response.data;
  }
};
