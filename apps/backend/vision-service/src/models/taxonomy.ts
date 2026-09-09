import { Schema } from 'mongoose';

/**
 * A project's *presentation* vocabulary: what its conditions, classes and metrics
 * are called and how they should be ordered and read.
 *
 * Deliberately not a validation gate. Results arrive from training pipelines over
 * the API, and a pipeline cannot be asked to register its vocabulary first — so
 * `test_results`/`results` stay open blobs and every reader discovers the keys
 * actually present. This document only decorates what discovery found: a label, a
 * colour, a position, and — the one thing data cannot tell us — whether a metric
 * is better high or low.
 */

export type MetricDirection = 'higher' | 'lower';
export type MetricFormat = 'number' | 'percent' | 'ms' | 'fps';
export type TaskType = 'segmentation' | 'detection' | 'classification' | 'other';

export interface TaxonomyTerm {
  key: string;
  label?: string;
  color?: string;
  order?: number;
}

export interface TaxonomyMetric {
  key: string;
  label?: string;
  direction?: MetricDirection;
  decimals?: number;
  format?: MetricFormat;
}

export interface IProjectTaxonomy {
  /** what the condition axis is called here — "Weather", "Scenario", "Site", "Split" */
  conditionLabel?: string;
  conditions?: TaxonomyTerm[];
  classes?: TaxonomyTerm[];
  metrics?: TaxonomyMetric[];
  /** which keys of a condition's `overall` block make up the summary row */
  overallMetrics?: string[];
  /** seeds the metric presets at creation time; nothing branches on it afterwards */
  taskType?: TaskType;
  /** prefix prepended to filenames in dataset export manifests, e.g. "camera/" */
  exportPathPrefix?: string;
}

const TermSchema = new Schema<TaxonomyTerm>(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    label: { type: String, trim: true, maxlength: 100 },
    color: { type: String, trim: true, maxlength: 7 },
    order: { type: Number }
  },
  { _id: false }
);

const MetricSchema = new Schema<TaxonomyMetric>(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    label: { type: String, trim: true, maxlength: 100 },
    direction: { type: String, enum: ['higher', 'lower'] },
    decimals: { type: Number, min: 0, max: 10 },
    format: { type: String, enum: ['number', 'percent', 'ms', 'fps'] }
  },
  { _id: false }
);

export const TaxonomySchema = new Schema<IProjectTaxonomy>(
  {
    conditionLabel: { type: String, trim: true, maxlength: 50 },
    conditions: { type: [TermSchema], default: undefined },
    classes: { type: [TermSchema], default: undefined },
    metrics: { type: [MetricSchema], default: undefined },
    overallMetrics: { type: [String], default: undefined },
    taskType: { type: String, enum: ['segmentation', 'detection', 'classification', 'other'] },
    exportPathPrefix: { type: String, trim: true, maxlength: 200 }
  },
  { _id: false }
);

/**
 * Metric defaults per task type, applied only when a project is created with a
 * `taskType` and no explicit `metrics`. They are a starting point a user edits,
 * not a constraint: a run reporting something absent from this list still renders,
 * it just gets the neutral default (higher-is-better, 4 decimals).
 */
export const TASK_TYPE_METRIC_PRESETS: Record<TaskType, TaxonomyMetric[]> = {
  segmentation: [
    { key: 'iou', label: 'IoU', direction: 'higher', decimals: 4 },
    { key: 'precision', label: 'Precision', direction: 'higher', decimals: 4 },
    { key: 'recall', label: 'Recall', direction: 'higher', decimals: 4 },
    { key: 'f1_score', label: 'F1', direction: 'higher', decimals: 4 },
    { key: 'mean_iou', label: 'Mean IoU', direction: 'higher', decimals: 4 },
    { key: 'mIoU_foreground', label: 'mIoU (foreground)', direction: 'higher', decimals: 4 },
    { key: 'pixel_accuracy', label: 'Pixel Accuracy', direction: 'higher', decimals: 4 },
    { key: 'mean_accuracy', label: 'Mean Accuracy', direction: 'higher', decimals: 4 },
    { key: 'fw_iou', label: 'FW IoU', direction: 'higher', decimals: 4 },
    { key: 'dice_score', label: 'Dice', direction: 'higher', decimals: 4 },
    { key: 'loss', label: 'Loss', direction: 'lower', decimals: 4 }
  ],
  detection: [
    { key: 'ap', label: 'AP', direction: 'higher', decimals: 4 },
    { key: 'mAP_50', label: 'mAP@50', direction: 'higher', decimals: 4 },
    { key: 'mAP_50_95', label: 'mAP@50-95', direction: 'higher', decimals: 4 },
    { key: 'precision', label: 'Precision', direction: 'higher', decimals: 4 },
    { key: 'recall', label: 'Recall', direction: 'higher', decimals: 4 },
    { key: 'f1_score', label: 'F1', direction: 'higher', decimals: 4 },
    { key: 'loss', label: 'Loss', direction: 'lower', decimals: 4 }
  ],
  classification: [
    { key: 'accuracy', label: 'Accuracy', direction: 'higher', decimals: 4 },
    { key: 'top1', label: 'Top-1', direction: 'higher', decimals: 4 },
    { key: 'top5', label: 'Top-5', direction: 'higher', decimals: 4 },
    { key: 'precision', label: 'Precision', direction: 'higher', decimals: 4 },
    { key: 'recall', label: 'Recall', direction: 'higher', decimals: 4 },
    { key: 'f1_score', label: 'F1', direction: 'higher', decimals: 4 },
    { key: 'loss', label: 'Loss', direction: 'lower', decimals: 4 }
  ],
  other: []
};

/** `overall` keys each preset summarises by default. */
export const TASK_TYPE_OVERALL_PRESETS: Record<TaskType, string[]> = {
  segmentation: ['mIoU_foreground', 'mean_accuracy', 'fw_iou', 'pixel_accuracy'],
  detection: ['mAP_50', 'mAP_50_95'],
  classification: ['accuracy', 'top1', 'top5'],
  other: []
};

/**
 * Metrics every project understands regardless of task type, so timing columns and
 * losses read the right way round even for a project that configured nothing.
 */
export const UNIVERSAL_METRIC_DEFAULTS: TaxonomyMetric[] = [
  { key: 'loss', label: 'Loss', direction: 'lower', decimals: 4 },
  { key: 'avg_per_sample_ms', label: 'Avg / sample (ms)', direction: 'lower', decimals: 2, format: 'ms' },
  { key: 'avg_per_batch_ms', label: 'Avg / batch (ms)', direction: 'lower', decimals: 2, format: 'ms' },
  { key: 'mean_time_ms', label: 'Mean time (ms)', direction: 'lower', decimals: 2, format: 'ms' },
  { key: 'total_seconds', label: 'Total (s)', direction: 'lower', decimals: 1 },
  { key: 'throughput_fps', label: 'FPS', direction: 'higher', decimals: 1, format: 'fps' },
  { key: 'fps', label: 'FPS', direction: 'higher', decimals: 1, format: 'fps' }
];
