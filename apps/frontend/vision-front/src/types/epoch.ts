import { PaginatedResponse } from './api';
import { SystemInfo } from './systemInfo';
import { Training } from './training';

export interface EpochMetrics {
  iou?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  ap?: number;
  [key: string]: any;
}

export interface EpochResults {
  train?: {
    loss?: number;
    mean_iou?: number;
    pixel_accuracy?: number;
    mean_accuracy?: number;
    dice_score?: number;
    [className: string]: EpochMetrics | number | undefined;
  };
  val?: {
    loss?: number;
    mean_iou?: number;
    pixel_accuracy?: number;
    mean_accuracy?: number;
    dice_score?: number;
    [className: string]: EpochMetrics | number | undefined;
  };
  system_info?: SystemInfo;
  [key: string]: any;
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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
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
