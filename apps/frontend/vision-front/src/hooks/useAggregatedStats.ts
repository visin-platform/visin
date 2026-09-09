import { useMemo } from 'react';
import { TestResult, TestResultMetrics } from '../types';
import { isRecord, readMetric } from '../taxonomy/discover';
import { useTaxonomyFor } from '../taxonomy/useTaxonomy';
import { DEFAULT_CLASS_METRICS } from '../components/test-results/performanceMetricsUtils';

export interface MetricAggregate {
  values: number[];
  mean: number;
}
export type AggregatedStats = Record<string, Record<string, Record<string, MetricAggregate>>>;

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Averages each class's metrics per condition, across a set of test results.
 *
 * Conditions, classes and metrics all come from the payloads rather than a fixed
 * list, so a project that reports something this platform has never seen still
 * aggregates. The taxonomy only decides the order they come back in.
 */
export const useAggregatedStats = (allTestResults: TestResult[]) => {
  const taxonomy = useTaxonomyFor(allTestResults);

  const aggregatedStats = useMemo(() => {
    if (allTestResults.length === 0) return null;

    const aggregated: AggregatedStats = {};

    taxonomy.conditions.forEach(condition => {
      const perClass: Record<string, Record<string, MetricAggregate>> = {};

      taxonomy.classes.forEach(className => {
        const collected: Record<string, number[]> = {};

        allTestResults.forEach(testResult => {
          const conditionData = testResult.test_results?.[condition.key];
          if (!isRecord(conditionData)) return;
          const classData = conditionData[className.key] as TestResultMetrics | undefined;
          if (!isRecord(classData)) return;

          DEFAULT_CLASS_METRICS.forEach(metric => {
            const value = readMetric(classData, metric);
            if (value !== undefined) {
              (collected[metric] ??= []).push(value);
            }
          });
        });

        // Keep the class only where something was actually reported, so an absent
        // class does not become a row of zeroes.
        if (Object.keys(collected).length > 0) {
          perClass[className.key] = Object.fromEntries(
            DEFAULT_CLASS_METRICS.map(metric => {
              const values = collected[metric] ?? [];
              return [metric, { values, mean: mean(values) }];
            })
          );
        }
      });

      if (Object.keys(perClass).length > 0) {
        aggregated[condition.key] = perClass;
      }
    });

    return aggregated;
  }, [allTestResults, taxonomy]);

  return { aggregatedStats, taxonomy };
};
