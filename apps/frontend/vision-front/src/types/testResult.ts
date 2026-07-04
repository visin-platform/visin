import { PaginatedResponse } from './api';

export interface TestResultMetrics {
  iou: number;
  precision: number;
  recall: number;
  f1_score: number;
  f1?: number; // Alternative field name used in some API responses
  mean_f1?: number; // Alternative field name used in some API responses
  ap: number;
}

export interface InferenceTimeMetrics {
  total_seconds: number;
  samples: number;
  batches: number;
  avg_per_sample_ms: number;
  avg_per_batch_ms: number;
  throughput_fps: number;
}

export interface TestResultOverallMetrics {
  mIoU_foreground: number;
  mean_accuracy: number;
  fw_iou: number;
  pixel_accuracy: number;
  confusion_matrix?: number[][];
  confusion_matrix_labels?: string[];
}

export interface TestResultCondition {
  pedestrian: TestResultMetrics;
  sign: TestResultMetrics;
  cyclist: TestResultMetrics;
  vehicle: TestResultMetrics;
  human: TestResultMetrics;
  inference_time: InferenceTimeMetrics;
  overall: TestResultOverallMetrics;
  [className: string]: TestResultMetrics | InferenceTimeMetrics | TestResultOverallMetrics;
}

export interface TestResultData {
  day_fair: TestResultCondition;
  night_fair: TestResultCondition;
  day_rain: TestResultCondition;
  night_rain: TestResultCondition;
  snow: TestResultCondition;
  overall: TestResultOverallMetrics;
  [condition: string]: TestResultCondition | TestResultOverallMetrics;
}

export interface TestResult {
  _id: string;
  timestamp: string;
  epoch: number;
  epoch_uuid: string;
  test_uuid: string;
  test_results: TestResultData;
  createdAt: string;
  updatedAt: string;
  training?: {
    _id: string;
    name: string;
    uuid: string;
    status: string;
  };
  epoch_info?: {
    epoch: number;
    epoch_time: number;
  };
}

export interface CreateTestResultData {
  timestamp?: string;
  epoch: number;
  epoch_uuid: string;
  test_uuid?: string;
  test_results: TestResultData;
}

export interface TestResultsPaginatedResponse extends PaginatedResponse<TestResult> {
  data: {
    testResults: TestResult[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
