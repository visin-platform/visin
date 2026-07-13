import { PaginatedResponse } from './api';
import { SystemInfo } from './systemInfo';
import { Training } from './training';

export interface EpochMetrics {
  iou?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  ap?: number;
  [key: string]: number | undefined;
}

// Real-world payloads nest per-class metrics under train/val/metrics directly,
// or under a further `per_class` key — consumers (the Class*Chart components)
// try both, so both shapes are allowed here.
export interface EpochConditionResults {
  loss?: number;
  mean_iou?: number;
  pixel_accuracy?: number;
  mean_accuracy?: number;
  dice_score?: number;
  per_class?: Record<string, EpochMetrics>;
  [className: string]: EpochMetrics | number | Record<string, EpochMetrics> | undefined;
}

export interface EpochResults {
  train?: EpochConditionResults;
  val?: EpochConditionResults;
  metrics?: EpochConditionResults;
  system_info?: SystemInfo;
  [key: string]: EpochConditionResults | SystemInfo | undefined;
}

export interface Epoch {
  _id: string;
  trainingId: string;
  training_uuid: string;
  epoch_uuid: string;
  epoch: number;
  timestamp: string;
  results: EpochResults;
  learning_rate?: number;
  epoch_time?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEpochData {
  trainingId: string;
  training_uuid: string;
  epoch_uuid?: string;
  epoch: number;
  timestamp?: string;
  results: EpochResults;
  learning_rate?: number;
  epoch_time?: number;
  metadata?: Record<string, unknown>;
}

export interface EpochsPaginatedResponse extends PaginatedResponse<Epoch> {
  data: {
    epochs: Epoch[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

// Training with Epochs
export interface TrainingWithEpochs {
  training: Training;
  epochs: Epoch[];
}
