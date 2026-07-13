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

const METRICS = ['iou', 'precision', 'recall', 'f1_score', 'ap'] as const;

/** Best (maximum) mean value for each metric of one class, across all trainings being compared. */
export function getBestValues(
  comparisonData: ComparisonData[],
  condition: string,
  className: string
): { [metric: string]: number } {
  const bestValues: { [key: string]: number } = {};

  comparisonData.forEach((comp) => {
    const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
    const classMetrics = conditionData?.[className];
    if (!classMetrics) return;

    METRICS.forEach((metric) => {
      const mean = classMetrics[metric]?.mean;
      if (mean !== undefined && (bestValues[metric] === undefined || mean > bestValues[metric])) {
        bestValues[metric] = mean;
      }
    });
  });

  return bestValues;
}

/** Sorts comparisonData by a table column ("training", "overall_fw_iou", or "<className>_<metric>") for one weather condition. */
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

    if (column === 'overall_fw_iou') {
      aValue = conditionDataA?.overall?.fw_iou?.mean ?? -Infinity;
      bValue = conditionDataB?.overall?.fw_iou?.mean ?? -Infinity;
    } else {
      // Column format: "<className>_<metric>" (e.g. "human_iou", "sign_precision")
      const [className, metric] = column.split('_');
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

/** Renders one weather condition's performance metrics table as a LaTeX table*, bolding each column's best value. */
export function generateConditionLatex(
  comparisonData: ComparisonData[],
  condition: string,
  decimals: number,
  multiplier: number
): string {
  const classNames = ['human', 'sign', 'vehicle'];
  const conditionTitle = condition.replace('_', ' ').toUpperCase();

  let latex = `\\begin{table*}[t]\n\\centering\n\\caption{Test Results Performance Metrics - ${conditionTitle}}\n\\label{tab:performance_metrics_${condition}}\n`;
  latex += `\\begin{tabular}{|l|${'c|c|c|c|c|'.repeat(classNames.length)}c|}\n\\hline\n`;

  latex += 'Training & ';
  classNames.forEach((className, index) => {
    const classTitle = className.charAt(0).toUpperCase() + className.slice(1);
    latex += `${classTitle} IoU & ${classTitle} Prec. & ${classTitle} Rec. & ${classTitle} F1 & ${classTitle} AP`;
    if (index < classNames.length - 1) {
      latex += ' & ';
    }
  });
  latex += ' & FW IoU \\\\\n\\hline\n';

  comparisonData.forEach(comp => {
    const trainingName = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
    const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
    latex += `${trainingName} `;

    classNames.forEach((className) => {
      const classMetrics = conditionData?.[className];
      const bestValues = getBestValues(comparisonData, condition, className);

      METRICS.forEach((metric) => {
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

    if (conditionData?.overall?.fw_iou?.mean !== undefined) {
      latex += `& ${(conditionData.overall.fw_iou.mean * multiplier).toFixed(decimals)} `;
    } else {
      latex += '& N/A ';
    }

    latex += '\\\\ \\hline\n';
  });

  latex += '\\end{tabular}\n\\end{table*}';

  return latex;
}
