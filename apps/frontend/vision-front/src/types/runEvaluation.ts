import type { Checkpoint, ValidationReport } from './evaluation';
import { PaginatedResponse } from './api';

/**
 * One class's metrics. All optional: a run reports whatever it computed, and AP
 * in particular is absent from most training-time payloads.
 */
export interface EvaluationClassMetrics {
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
export interface EvaluationOverallMetrics {
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
export interface EvaluationCondition {
  inference_time?: InferenceTimeMetrics;
  overall?: EvaluationOverallMetrics;
  [className: string]: EvaluationClassMetrics | InferenceTimeMetrics | EvaluationOverallMetrics | undefined;
}

/**
 * A whole test result: one entry per condition, plus an optional top-level
 * `overall`. Condition names come from the data, not from this type.
 */
export interface EvaluationResults {
  overall?: EvaluationOverallMetrics;
  [condition: string]: EvaluationCondition | EvaluationOverallMetrics | undefined;
}

export interface RunEvaluation {
  _id: string;
  timestamp: string;
  epoch: number;
  epoch_uuid: string;
  test_uuid: string;
  test_results: EvaluationResults;
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
  /**
   * What makes a result one of the ranked kind: the suite it was scored on, and the server's verdict on it. Both are
   * absent on a plain test a run reported, which is an exploratory measurement of the same record.
   */
  suite?: { id: string; slug: string; version: number };
  validation?: ValidationReport;
  /** put on a public leaderboard by a manager */
  publishedAt?: string;
  /** which model was scored, for a result with no run behind it (a Hub checkpoint) */
  checkpoint?: Checkpoint;
}

export interface CreateRunEvaluationData {
  timestamp?: string;
  epoch: number;
  epoch_uuid: string;
  test_uuid?: string;
  test_results: EvaluationResults;
}

export interface RunEvaluationsResponse extends PaginatedResponse<RunEvaluation> {
  data: {
    evaluations: RunEvaluation[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
