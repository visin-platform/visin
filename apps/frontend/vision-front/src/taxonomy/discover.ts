import { Epoch } from '../types/epoch';
import { TestResult } from '../types/testResult';
import { RESERVED_CLASS_KEYS, RESERVED_CONDITION_KEYS, RESERVED_EPOCH_KEYS } from './reserved';

/**
 * Reads the vocabulary out of the payloads themselves.
 *
 * This is the half of the taxonomy that needs no setup, and it is deliberately the
 * authoritative half: results arrive from training pipelines over the API, which
 * cannot be asked to declare their classes first. A project's stored taxonomy only
 * relabels and orders what turns up here — it never decides what exists.
 */

type Rec = Record<string, unknown>;

export const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Condition names present across a set of test results. */
export const discoverConditions = (testResults: TestResult[]): string[] => {
  const found = new Set<string>();
  testResults.forEach(result => {
    if (!isRecord(result?.test_results)) {
      return;
    }
    Object.entries(result.test_results).forEach(([key, value]) => {
      if (!RESERVED_CONDITION_KEYS.has(key) && isRecord(value)) {
        found.add(key);
      }
    });
  });
  return Array.from(found);
};

/** Class names present inside any condition of a set of test results. */
export const discoverClasses = (testResults: TestResult[]): string[] => {
  const found = new Set<string>();
  testResults.forEach(result => {
    if (!isRecord(result?.test_results)) {
      return;
    }
    Object.entries(result.test_results).forEach(([conditionKey, conditionValue]) => {
      if (RESERVED_CONDITION_KEYS.has(conditionKey) || !isRecord(conditionValue)) {
        return;
      }
      Object.entries(conditionValue).forEach(([classKey, classValue]) => {
        if (!RESERVED_CLASS_KEYS.has(classKey) && isRecord(classValue)) {
          found.add(classKey);
        }
      });
    });
  });
  return Array.from(found);
};

/** Metric names reported for classes, e.g. iou / precision / recall / ap. */
export const discoverClassMetrics = (testResults: TestResult[]): string[] => {
  const found = new Set<string>();
  testResults.forEach(result => {
    if (!isRecord(result?.test_results)) {
      return;
    }
    Object.values(result.test_results).forEach(conditionValue => {
      if (!isRecord(conditionValue)) {
        return;
      }
      Object.entries(conditionValue).forEach(([classKey, classValue]) => {
        if (RESERVED_CLASS_KEYS.has(classKey) || !isRecord(classValue)) {
          return;
        }
        Object.entries(classValue).forEach(([metricKey, metricValue]) => {
          if (typeof metricValue === 'number') {
            found.add(metricKey);
          }
        });
      });
    });
  });
  return Array.from(found);
};

/** Metric names in the `overall` blocks, which summarise a whole condition. */
export const discoverOverallMetrics = (testResults: TestResult[]): string[] => {
  const found = new Set<string>();
  const collect = (block: unknown) => {
    if (!isRecord(block)) {
      return;
    }
    Object.entries(block).forEach(([key, value]) => {
      if (typeof value === 'number') {
        found.add(key);
      }
    });
  };
  testResults.forEach(result => {
    if (!isRecord(result?.test_results)) {
      return;
    }
    collect(result.test_results.overall);
    Object.entries(result.test_results).forEach(([conditionKey, conditionValue]) => {
      if (!RESERVED_CONDITION_KEYS.has(conditionKey) && isRecord(conditionValue)) {
        collect(conditionValue.overall);
      }
    });
  });
  return Array.from(found);
};

/**
 * Class names in a set of epochs, for a given metric. Walks `val`/`train`/`metrics`
 * and the optional `per_class` nesting under each, since real payloads use both.
 *
 * A class counts as present only if it actually carries the metric, which is what
 * keeps an AP chart empty for a run that never computed AP.
 */
export const discoverEpochClasses = (epochs: Epoch[], metric: string): string[] => {
  const found = new Set<string>();

  const scan = (block: unknown) => {
    if (!isRecord(block)) {
      return;
    }
    Object.entries(block).forEach(([key, value]) => {
      if (RESERVED_EPOCH_KEYS.has(key)) {
        return;
      }
      if (readMetric(value, metric) !== undefined) {
        found.add(key);
      }
    });
  };

  epochs.forEach(epoch => {
    (['val', 'train', 'metrics'] as const).forEach(section => {
      const block = epoch.results?.[section];
      scan(block);
      if (isRecord(block)) {
        scan(block.per_class);
      }
    });
  });

  return Array.from(found);
};

/**
 * Pulls one metric off a per-class entry. `ap` is sometimes an object with a
 * `mean`, so that shape is unwrapped rather than treated as missing.
 */
export const readMetric = (entry: unknown, metric: string): number | undefined => {
  if (!isRecord(entry)) {
    return undefined;
  }
  const value = entry[metric];
  if (typeof value === 'number') {
    return value;
  }
  if (isRecord(value) && typeof value.mean === 'number') {
    return value.mean;
  }
  // F1 is spelled three ways in the wild depending on the pipeline
  if (metric === 'f1_score' || metric === 'f1') {
    for (const alias of ['f1_score', 'f1', 'mean_f1']) {
      if (typeof entry[alias] === 'number') {
        return entry[alias] as number;
      }
    }
  }
  return undefined;
};
