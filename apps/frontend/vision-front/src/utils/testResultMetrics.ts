import type { TestResult, TestResultData } from '../types';
import { isRecord, readMetric } from '../taxonomy/discover';
import { RESERVED_CLASS_KEYS, RESERVED_CONDITION_KEYS } from '../taxonomy/reserved';

/** Per-class metrics a listing averages into one figure each. */
export const AVERAGED_METRICS = ['iou', 'precision', 'recall', 'f1_score'];

const mean = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Mean of one metric across every class in a condition. Classes come from the
 * payload, so a project with its own vocabulary averages over its own classes.
 */
const averageOverClasses = (conditionData: unknown, metric: string): number | undefined => {
  if (!isRecord(conditionData)) return undefined;
  return mean(
    Object.entries(conditionData)
      .filter(([key]) => !RESERVED_CLASS_KEYS.has(key))
      .map(([, classData]) => readMetric(classData, metric))
      .filter((value): value is number => value !== undefined)
  );
};

/**
 * Mean of one per-class metric across every condition of a result. A genuine 0
 * counts, and a condition with no value for it is left out rather than read as 0.
 */
export const averageAcrossConditions = (results: TestResultData, metric: string): number | undefined => {
  if (!isRecord(results)) return undefined;
  return mean(
    Object.entries(results)
      .filter(([key]) => !RESERVED_CONDITION_KEYS.has(key))
      .map(([, conditionData]) => averageOverClasses(conditionData, metric))
      .filter((value): value is number => value !== undefined)
  );
};

/** Mean of one summary metric across the conditions that report an `overall`, or the top-level one. */
export const overallMean = (results: TestResultData, metric: string): number | undefined => {
  if (!isRecord(results)) return undefined;

  const blocks = Object.entries(results)
    .filter(([key]) => !RESERVED_CONDITION_KEYS.has(key))
    .map(([, conditionData]) => (isRecord(conditionData) ? conditionData.overall : undefined))
    .filter(isRecord);

  // fall back to the top-level `overall` when no condition carries one
  const sources = blocks.length > 0 ? blocks : [results.overall].filter(isRecord);
  return mean(sources.map(block => readMetric(block, metric)).filter((value): value is number => value !== undefined));
};

/** Mean of each named summary metric. */
export const overallMeans = (results: TestResultData, metrics: string[]): Record<string, number | undefined> =>
  Object.fromEntries(metrics.map(metric => [metric, overallMean(results, metric)]));

/** Where a result's figure for a metric comes from: the mean over classes, or the run's own summary. */
export type MetricSource = 'classes' | 'overall';

export interface RankableMetric {
  key: string;
  source: MetricSource;
}

export const metricValue = (result: TestResult, metric: RankableMetric): number | undefined =>
  metric.source === 'classes'
    ? averageAcrossConditions(result.test_results, metric.key)
    : overallMean(result.test_results, metric.key);

export interface RunBest {
  /** the run's test result that scored best, or its newest when none scored */
  result: TestResult;
  value: number | undefined;
  /** how many test results the run has */
  tests: number;
}

const time = (result: TestResult) => new Date(result.timestamp).getTime() || 0;

/**
 * One row per run: the test result that did best on `metric`, in the direction
 * the project reads it, and runs ranked by it. A run with no value for the
 * metric still appears, after the ranked ones, newest first. Results with no run
 * each stand alone.
 */
export const bestPerRun = (
  results: TestResult[],
  metric: RankableMetric,
  isBetter: (a: number, b: number) => boolean
): RunBest[] => {
  const byRun = new Map<string, TestResult[]>();
  for (const result of results) {
    const key = result.training?._id ?? `test:${result._id}`;
    byRun.set(key, [...(byRun.get(key) ?? []), result]);
  }

  const rows = [...byRun.values()].map((group): RunBest => {
    const scored = group
      .map(result => ({ result, value: metricValue(result, metric) }))
      .filter((entry): entry is { result: TestResult; value: number } => entry.value !== undefined);
    if (scored.length === 0) {
      const newest = [...group].sort((a, b) => time(b) - time(a))[0];
      return { result: newest, value: undefined, tests: group.length };
    }
    // The better value wins; a tie goes to the later epoch, which has trained longer.
    const best = scored.reduce((a, b) => {
      if (isBetter(b.value, a.value)) return b;
      if (isBetter(a.value, b.value)) return a;
      return b.result.epoch > a.result.epoch ? b : a;
    });
    return { result: best.result, value: best.value, tests: group.length };
  });

  return rows.sort((a, b) => {
    if (a.value === undefined || b.value === undefined) {
      if (a.value === b.value) return time(b.result) - time(a.result);
      return a.value === undefined ? 1 : -1;
    }
    if (isBetter(a.value, b.value)) return -1;
    if (isBetter(b.value, a.value)) return 1;
    return time(b.result) - time(a.result);
  });
};
