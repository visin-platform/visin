import { ResolvedTaxonomy } from '../../types/taxonomy';

export interface MetricStat {
  mean: number;
  std?: number;
}
export type ClassAggregates = Record<string, MetricStat>;
// One condition's aggregated data, keyed by class name (plus the "overall" pseudo-class).
export type ConditionAggregates = Record<string, ClassAggregates>;

export interface ComparisonData {
  // Matches TrainingComparison['aggregatedTestResults']'s loose shape; cast to
  // ConditionAggregates/ClassAggregates at the point of use below.
  aggregatedResults: Record<string, Record<string, unknown>> | null;
  training: { _id: string; name: string };
  testResultsCount: number;
}

export type SortDirection = 'asc' | 'desc';

export const DEFAULT_CLASS_METRICS = ['iou', 'precision', 'recall', 'f1_score', 'ap'];

/**
 * Best mean value for each metric of one class, across the trainings being compared.
 *
 * "Best" is direction-aware: taking the maximum unconditionally highlighted the
 * *worst* row for any metric where lower wins — a loss, a latency, an error rate.
 * The taxonomy is the only thing that knows which way a metric reads.
 */
export function getBestValues(
  comparisonData: ComparisonData[],
  condition: string,
  className: string,
  taxonomy: ResolvedTaxonomy,
  metrics: string[] = DEFAULT_CLASS_METRICS
): { [metric: string]: number } {
  const bestValues: { [key: string]: number } = {};

  comparisonData.forEach((comp) => {
    const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
    const classMetrics = conditionData?.[className];
    if (!classMetrics) return;

    metrics.forEach((metric) => {
      const mean = classMetrics[metric]?.mean;
      if (mean === undefined) return;
      const current = bestValues[metric];
      if (current === undefined || taxonomy.isBetter(metric, mean, current)) {
        bestValues[metric] = mean;
      }
    });
  });

  return bestValues;
}

/** Sorts comparisonData by a table column ("training", "overall_<metric>", or "<className>_<metric>") for one condition. */
export function sortComparisonData(
  comparisonData: ComparisonData[],
  condition: string,
  column: string,
  direction: SortDirection
): ComparisonData[] {
  return [...comparisonData].sort((a, b) => {
    if (column === 'training') {
      const comparison = a.training.name.toLowerCase().localeCompare(b.training.name.toLowerCase());
      return direction === 'asc' ? comparison : -comparison;
    }

    let aValue: number;
    let bValue: number;

    const conditionDataA = a.aggregatedResults?.[condition] as ConditionAggregates | undefined;
    const conditionDataB = b.aggregatedResults?.[condition] as ConditionAggregates | undefined;

    if (column.startsWith('overall_')) {
      const metric = column.slice('overall_'.length);
      aValue = conditionDataA?.overall?.[metric]?.mean ?? -Infinity;
      bValue = conditionDataB?.overall?.[metric]?.mean ?? -Infinity;
    } else {
      // Column format: "<class>_<metric>". A class name may itself contain an
      // underscore, so split on the *last* one and let the metric be the tail.
      const split = column.lastIndexOf('_');
      const className = split === -1 ? column : column.slice(0, split);
      const metric = split === -1 ? '' : column.slice(split + 1);
      aValue = conditionDataA?.[className]?.[metric]?.mean ?? -Infinity;
      bValue = conditionDataB?.[className]?.[metric]?.mean ?? -Infinity;
    }

    const comparison = aValue - bValue;
    return direction === 'asc' ? comparison : -comparison;
  });
}

export function formatMetricNumber(value: unknown, decimals: number, multiplier: number): string {
  if (typeof value === 'number' && !isNaN(value)) {
    return (value * multiplier).toFixed(decimals);
  }
  return 'N/A';
}

/**
 * Renders one condition's performance metrics table as a LaTeX table*, bolding each
 * column's best value. Width follows the class and metric lists it is given, so a
 * project with two classes gets a two-class table rather than three empty columns.
 */
export function generateConditionLatex(
  comparisonData: ComparisonData[],
  condition: string,
  decimals: number,
  multiplier: number,
  taxonomy: ResolvedTaxonomy,
  classNames: string[] = taxonomy.classes.map(c => c.key),
  metrics: string[] = DEFAULT_CLASS_METRICS
): string {
  const conditionTitle = taxonomy.conditionTitle(condition).toUpperCase();
  const summaryMetric = taxonomy.overallMetrics[0];

  let latex = `\\begin{table*}[t]\n\\centering\n\\caption{Test Results Performance Metrics - ${conditionTitle}}\n\\label{tab:performance_metrics_${condition}}\n`;
  const columnSpec = classNames.map(() => 'c|'.repeat(metrics.length)).join('');
  latex += `\\begin{tabular}{|l|${columnSpec}${summaryMetric ? 'c|' : ''}}\n\\hline\n`;

  const headerCells = classNames.flatMap(className => {
    const classTitle = taxonomy.classLabel(className);
    return metrics.map(metric => `${classTitle} ${taxonomy.metric(metric).label}`);
  });
  if (summaryMetric) {
    headerCells.push(summaryMetric.label);
  }
  latex += `Training & ${headerCells.join(' & ')} \\\\\n\\hline\n`;

  comparisonData.forEach(comp => {
    const trainingName = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
    const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
    latex += `${trainingName} `;

    classNames.forEach((className) => {
      const classMetrics = conditionData?.[className];
      const bestValues = getBestValues(comparisonData, condition, className, taxonomy, metrics);

      metrics.forEach((metric) => {
        const mean = classMetrics?.[metric]?.mean;
        if (mean !== undefined) {
          const isBest = mean === bestValues[metric];
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${(mean * multiplier).toFixed(decimals)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }
      });
    });

    if (summaryMetric) {
      const summary = conditionData?.overall?.[summaryMetric.key]?.mean;
      latex += summary !== undefined ? `& ${(summary * multiplier).toFixed(decimals)} ` : '& N/A ';
    }

    latex += '\\\\ \\hline\n';
  });

  latex += '\\end{tabular}\n\\end{table*}';

  return latex;
}
