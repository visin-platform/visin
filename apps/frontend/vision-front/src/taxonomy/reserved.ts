/**
 * Keys that appear alongside class/condition names in a results payload but are
 * not themselves classes or conditions. Discovery skips these; everything else it
 * finds is real vocabulary.
 */

/** Sits beside condition names in `test_results`. */
export const RESERVED_CONDITION_KEYS = new Set(['overall', 'inference_time', 'metadata']);

/** Sits beside class names inside one condition. */
export const RESERVED_CLASS_KEYS = new Set(['overall', 'inference_time', 'per_class', 'metadata']);

/**
 * Sits beside class names inside an epoch's `train`/`val`/`metrics` block. Matches
 * the set ClassMetricChart has always used, so extracting it changed no behaviour.
 */
export const RESERVED_EPOCH_KEYS = new Set([
  'loss',
  'mean_iou',
  'learning_rate',
  'epoch_time',
  'timestamp',
  'per_class'
]);
