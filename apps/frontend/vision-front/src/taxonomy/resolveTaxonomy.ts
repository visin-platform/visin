import {
  MetricDirection,
  MetricFormat,
  ProjectTaxonomy,
  ResolvedMetric,
  ResolvedTaxonomy,
  ResolvedTerm,
  TaxonomyMetric,
  TaxonomyTerm
} from '../types/taxonomy';
import { humanize } from './humanize';

/**
 * Merges what the data contains with what the project says about it.
 *
 * Discovery decides *what exists*; the stored taxonomy decides *how it reads* —
 * label, colour, order, and the one fact no payload carries, whether a metric is
 * better high or low. Configured terms come first in their stated order; anything
 * discovered but unconfigured follows, sorted, so a pipeline that starts emitting
 * a new class shows up immediately instead of vanishing.
 */

export const PALETTE = [
  '#1976d2',
  '#d32f2f',
  '#f57c00',
  '#388e3c',
  '#7b1fa2',
  '#00796b',
  '#c2185b',
  '#0097a7',
  '#fbc02d',
  '#6a1b9a'
];

const DEFAULT_DECIMALS = 4;

/**
 * Metrics whose direction is not the usual "higher is better". Without this a
 * loss or a latency column gets its *worst* value highlighted as the best.
 */
const LOWER_IS_BETTER = new Set([
  'loss',
  'train_loss',
  'val_loss',
  'error',
  'error_rate',
  'rmse',
  'mae',
  'mse',
  'total_seconds',
  'mean_time_ms',
  'std_time_ms',
  'min_time_ms',
  'max_time_ms',
  'avg_per_sample_ms',
  'avg_per_batch_ms',
  'latency_ms',
  'gpu_memory_mean_mb',
  'gpu_memory_max_mb',
  'ram_memory_mean_mb',
  'ram_memory_max_mb'
]);

const DEFAULT_FORMATS: Record<string, MetricFormat> = {
  throughput_fps: 'fps',
  fps: 'fps',
  avg_per_sample_ms: 'ms',
  avg_per_batch_ms: 'ms',
  mean_time_ms: 'ms',
  latency_ms: 'ms'
};

const DEFAULT_DECIMAL_OVERRIDES: Record<string, number> = {
  throughput_fps: 1,
  fps: 1,
  total_seconds: 1,
  avg_per_sample_ms: 2,
  avg_per_batch_ms: 2,
  mean_time_ms: 2
};

const defaultDirection = (key: string): MetricDirection =>
  LOWER_IS_BETTER.has(key.toLowerCase()) ? 'lower' : 'higher';

const resolveMetric = (key: string, configured?: TaxonomyMetric): ResolvedMetric => ({
  key,
  label: configured?.label?.trim() || humanize(key),
  direction: configured?.direction ?? defaultDirection(key),
  decimals: configured?.decimals ?? DEFAULT_DECIMAL_OVERRIDES[key] ?? DEFAULT_DECIMALS,
  format: configured?.format ?? DEFAULT_FORMATS[key] ?? 'number'
});

const byOrderThenName = (a: TaxonomyTerm, b: TaxonomyTerm) => {
  const ao = a.order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.order ?? Number.MAX_SAFE_INTEGER;
  return ao === bo ? a.key.localeCompare(b.key) : ao - bo;
};

/**
 * Configured terms in their given order, then discovered-but-unconfigured ones
 * sorted by name. A configured term is kept even when absent from the current
 * data so a column does not disappear on a run that happened to skip it.
 */
const mergeTerms = (configured: TaxonomyTerm[] | undefined, discovered: string[]): ResolvedTerm[] => {
  const ordered = [...(configured ?? [])].sort(byOrderThenName);
  const seen = new Set(ordered.map(term => term.key));
  const extras = discovered.filter(key => !seen.has(key)).sort((a, b) => a.localeCompare(b));

  return [...ordered.map(t => t.key), ...extras].map((key, index) => {
    const match = ordered.find(term => term.key === key);
    return {
      key,
      label: match?.label?.trim() || humanize(key),
      color: match?.color || PALETTE[index % PALETTE.length]
    };
  });
};

export interface DiscoveredVocabulary {
  conditions?: string[];
  classes?: string[];
  metrics?: string[];
  overallMetrics?: string[];
}

export const resolveTaxonomy = (
  taxonomy: ProjectTaxonomy | undefined,
  discovered: DiscoveredVocabulary = {}
): ResolvedTaxonomy => {
  const conditions = mergeTerms(taxonomy?.conditions, discovered.conditions ?? []);
  const classes = mergeTerms(taxonomy?.classes, discovered.classes ?? []);

  const metricConfig = new Map((taxonomy?.metrics ?? []).map(m => [m.key, m]));
  const metric = (key: string) => resolveMetric(key, metricConfig.get(key));

  // configured `overallMetrics` wins; otherwise summarise whatever the data has
  const overallKeys = taxonomy?.overallMetrics?.length
    ? taxonomy.overallMetrics
    : (discovered.overallMetrics ?? []).slice().sort((a, b) => a.localeCompare(b));

  const isBetter = (metricKey: string, a: number, b: number) =>
    metric(metricKey).direction === 'lower' ? a < b : a > b;

  const labelFrom = (terms: ResolvedTerm[]) => (key: string) =>
    terms.find(term => term.key === key)?.label ?? humanize(key);

  return {
    conditionLabel: taxonomy?.conditionLabel?.trim() || 'Condition',
    conditions,
    classes,
    classLabel: labelFrom(classes),
    conditionTitle: labelFrom(conditions),
    overallMetrics: overallKeys.map(metric),
    taskType: taxonomy?.taskType ?? 'other',
    exportPathPrefix: taxonomy?.exportPathPrefix ?? '',
    metric,
    isBetter,
    best: (metricKey, values) => {
      const numbers = values.filter(v => typeof v === 'number' && Number.isFinite(v));
      if (numbers.length === 0) {
        return undefined;
      }
      return numbers.reduce((best, value) => (isBetter(metricKey, value, best) ? value : best));
    }
  };
};

/**
 * Orders the keys of a record by the taxonomy: configured terms first in their
 * stated order, then anything else sorted by name. Nothing is dropped — the point
 * is that a key the project never declared still gets shown.
 */
export const orderKeysByTaxonomy = (
  terms: ResolvedTerm[],
  record: Record<string, unknown> | undefined
): string[] => {
  if (!record) {
    return [];
  }
  const known = terms.map(term => term.key).filter(key => key in record);
  const rest = Object.keys(record)
    .filter(key => !terms.some(term => term.key === key))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
};

/** A taxonomy for contexts with neither a project nor data — keeps components total. */
export const EMPTY_TAXONOMY = resolveTaxonomy(undefined, {});
