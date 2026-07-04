import { PaginatedResponse } from './api';

export interface Training {
  _id: string;
  uuid: string;
  training_uuid?: string; // Alternative UUID field name
  name: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  projectId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tags?: string[];
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  metrics?: {
    totalTime: number;
    epochCount: number;
    maxEpoch: number;
    lastEpochTimestamp: string | null;
    cpuCost: number;
    gpuCost: number;
    totalCost: number;
  };
}

export interface CreateTrainingData {
  uuid?: string;
  name: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  projectId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  tags?: string[];
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, any>;
}

export interface TrainingsPaginatedResponse extends PaginatedResponse<Training> {
  data: {
    trainings: Training[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
