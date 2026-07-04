import { PaginatedResponse } from './api';
import { Training } from './training';

export interface Comparison {
  _id: string;
  uuid: string;
  name: string;
  description?: string;
  type: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds: string[];
  projectId?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateComparisonData {
  uuid?: string;
  name: string;
  description?: string;
  type: 'trainings';
  itemIds: string[];
  projectId?: string;
  metadata?: any;
}

export interface UpdateComparisonData {
  name?: string;
  description?: string;
  type?: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds?: string[];
  metadata?: any;
}

export interface ComparisonsPaginatedResponse extends PaginatedResponse<Comparison> {
  data: {
    comparisons: Comparison[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

// Training Comparison Types
export interface ComparisonEpoch {
  epoch: number;
  results: any;
  epoch_time?: number;
  timestamp: string;
}

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
  lastEpoch: ComparisonEpoch | null;
  epochs: ComparisonEpoch[];
  aggregatedTestResults: any | null;
  testResultsCount: number;
  benchmarks: any[];
}

export interface TrainingComparisonResponse {
  comparison: TrainingComparison[];
  summary: {
    totalTrainings: number;
    trainingsWithEpochs: number;
  };
}
