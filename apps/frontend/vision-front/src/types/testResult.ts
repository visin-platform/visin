import { PaginatedResponse } from './api';

/**
 * One class's metrics. All optional: a run reports whatever it computed, and AP
 * in particular is absent from most training-time payloads.
 */
export interface TestResultMetrics {
  iou?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  f1?: number; // Alternative field name used in some API responses
  mean_f1?: number; // Alternative field name used in some API responses
  ap?: number;
  [metric: string]: number | undefined;
}

export interface InferenceTimeMetrics {
  total_seconds: number;
  samples: number;
  batches: number;
  avg_per_sample_ms: number;
  avg_per_batch_ms: number;
  throughput_fps: number;
}

/**
 * A condition's summary block. The named metrics are the common segmentation ones
 * and are hints, not a contract — a detection or classification run reports its
 * own, which the index signature admits.
 */
export interface TestResultOverallMetrics {
  mIoU_foreground?: number;
  mean_accuracy?: number;
  fw_iou?: number;
  pixel_accuracy?: number;
  confusion_matrix?: number[][];
  confusion_matrix_labels?: string[];
  [metric: string]: number | number[][] | string[] | undefined;
}

/**
 * One condition's results: a metrics object per class, plus the two reserved
 * pseudo-classes. Class names are whatever the pipeline reported — this used to
 * name five of them as *required*, so a genuinely generic payload failed to
 * type-check even though the backend stores the field as an open blob.
 */
export interface TestResultCondition {
  inference_time?: InferenceTimeMetrics;
  overall?: TestResultOverallMetrics;
  [className: string]: TestResultMetrics | InferenceTimeMetrics | TestResultOverallMetrics | undefined;
}

/**
 * A whole test result: one entry per condition, plus an optional top-level
 * `overall`. Condition names come from the data, not from this type.
 */
export interface TestResultData {
  overall?: TestResultOverallMetrics;
  [condition: string]: TestResultCondition | TestResultOverallMetrics | undefined;
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
