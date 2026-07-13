import { PaginatedResponse } from './api';
import { Training } from './training';
import { EpochResults } from './epoch';
import { Benchmark } from './benchmark';

export interface Comparison {
  _id: string;
  uuid: string;
  name: string;
  description?: string;
  type: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds: string[];
  projectId?: string;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
}

export interface UpdateComparisonData {
  name?: string;
  description?: string;
  type?: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds?: string[];
  metadata?: Record<string, unknown>;
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
  results: EpochResults;
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
  aggregatedTestResults: Record<string, Record<string, unknown>> | null;
  testResultsCount: number;
  benchmarks: Benchmark[];
}

export interface TrainingComparisonResponse {
  comparison: TrainingComparison[];
  summary: {
    totalTrainings: number;
    trainingsWithEpochs: number;
  };
}
