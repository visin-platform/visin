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

/** What a project stores. Every field optional — absent means "discover it". */
export interface ProjectTaxonomy {
  conditionLabel?: string;
  conditions?: TaxonomyTerm[];
  classes?: TaxonomyTerm[];
  metrics?: TaxonomyMetric[];
  overallMetrics?: string[];
  taskType?: TaskType;
  exportPathPrefix?: string;
}

/** What consumers get: never partial, so no component needs a fallback of its own. */
export interface ResolvedTerm {
  key: string;
  label: string;
  color: string;
}

export interface ResolvedMetric {
  key: string;
  label: string;
  direction: MetricDirection;
  decimals: number;
  format: MetricFormat;
}

export interface ResolvedTaxonomy {
  /** heading for the condition axis — "Weather", "Scenario", "Site", … */
  conditionLabel: string;
  conditions: ResolvedTerm[];
  classes: ResolvedTerm[];
  /** the `overall` block's summary metrics, in display order */
  overallMetrics: ResolvedMetric[];
  taskType: TaskType;
  exportPathPrefix: string;
  /** definition for any metric key, invented from defaults if unconfigured */
  metric: (key: string) => ResolvedMetric;
  /** display name for a class key, humanized when the project hasn't named it */
  classLabel: (key: string) => string;
  /** display name for one condition key (not the axis name — that's conditionLabel) */
  conditionTitle: (key: string) => string;
  /** true when `a` is the better value for that metric — the direction-aware `>` */
  isBetter: (metricKey: string, a: number, b: number) => boolean;
  /** the best of `values` for that metric, or undefined when there are none */
  best: (metricKey: string, values: number[]) => number | undefined;
}

/**
 * What an hour of training costs on this project's hardware. Absent fields fall
 * back to the platform defaults, so a project that sets none behaves as before.
 */
export interface ProjectCosting {
  cpuRatePerHour?: number;
  gpuRatePerHour?: number;
  /** ISO 4217 code — 'EUR', 'USD', … */
  currency?: string;
}
