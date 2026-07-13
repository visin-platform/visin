import { TrainingComparison, EpochMetrics } from '../../types';

export interface ValidationMetrics {
  meanIoU?: { mean: number; std: number };
  meanPrecision?: { mean: number; std: number };
  meanRecall?: { mean: number; std: number };
  meanF1?: { mean: number; std: number };
}

export interface TrainingMetricsData {
  training: TrainingComparison['training'];
  metrics: ValidationMetrics | null;
}

export interface BestValidationValues {
  meanIoU: number;
  meanPrecision: number;
  meanRecall: number;
  meanF1: number;
}

function meanAndStd(values: number[]): { mean: number; std: number } {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * For each training, averages validation IoU/precision/recall/F1 across its
 * top 10 epochs by IoU (precision/recall/F1 are first averaged across
 * classes within an epoch, then across those top epochs).
 */
export function computeTrainingMetrics(comparisonData: TrainingComparison[]): TrainingMetricsData[] {
  return comparisonData.map(comp => {
    const sortedEpochs = comp.epochs
      .filter(epoch => epoch.results?.val?.mean_iou !== undefined)
      .sort((a, b) => (b.results?.val?.mean_iou ?? 0) - (a.results?.val?.mean_iou ?? 0))
      .slice(0, 10);

    if (sortedEpochs.length === 0) {
      return { training: comp.training, metrics: null };
    }

    const avgMetrics: ValidationMetrics = {};

    const iouValues = sortedEpochs.map(epoch => epoch.results?.val?.mean_iou).filter(val => val !== undefined) as number[];
    if (iouValues.length > 0) {
      avgMetrics.meanIoU = meanAndStd(iouValues);
    }

    const epochMetrics: { precision: number[]; recall: number[]; f1: number[] } = { precision: [], recall: [], f1: [] };

    sortedEpochs.forEach(epoch => {
      const valResults = epoch.results?.val;
      if (!valResults) return;

      const epochPrecision: number[] = [];
      const epochRecall: number[] = [];
      const epochF1: number[] = [];

      Object.keys(valResults).forEach(key => {
        if (key === 'loss' || key === 'mean_iou' || key === 'val_loss') return;
        const classData = valResults[key] as EpochMetrics | undefined;
        if (classData && typeof classData === 'object') {
          if (typeof classData.precision === 'number') epochPrecision.push(classData.precision);
          if (typeof classData.recall === 'number') epochRecall.push(classData.recall);
          if (typeof classData.f1_score === 'number' || typeof classData.f1 === 'number') {
            epochF1.push((classData.f1_score ?? classData.f1) as number);
          }
        }
      });

      if (epochPrecision.length > 0) epochMetrics.precision.push(epochPrecision.reduce((s, v) => s + v, 0) / epochPrecision.length);
      if (epochRecall.length > 0) epochMetrics.recall.push(epochRecall.reduce((s, v) => s + v, 0) / epochRecall.length);
      if (epochF1.length > 0) epochMetrics.f1.push(epochF1.reduce((s, v) => s + v, 0) / epochF1.length);
    });

    if (epochMetrics.precision.length > 0) avgMetrics.meanPrecision = meanAndStd(epochMetrics.precision);
    if (epochMetrics.recall.length > 0) avgMetrics.meanRecall = meanAndStd(epochMetrics.recall);
    if (epochMetrics.f1.length > 0) avgMetrics.meanF1 = meanAndStd(epochMetrics.f1);

    return { training: comp.training, metrics: avgMetrics };
  });
}

function extractMeanValue(metric: { mean: number; std: number } | undefined): number {
  return metric ? metric.mean : -Infinity;
}

/** Drops trainings with no validation metrics, then sorts the rest by the given column. */
export function sortTrainingsWithMetrics(
  trainingMetrics: TrainingMetricsData[],
  sortColumn: string,
  sortDirection: 'asc' | 'desc'
): TrainingMetricsData[] {
  return trainingMetrics
    .filter(t => t.metrics !== null)
    .sort((a, b) => {
      if (sortColumn === 'training') {
        const comparison = a.training.name.toLowerCase().localeCompare(b.training.name.toLowerCase());
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      const key = sortColumn as keyof ValidationMetrics;
      const aValue = extractMeanValue(a.metrics?.[key]);
      const bValue = extractMeanValue(b.metrics?.[key]);
      const comparison = aValue - bValue;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
}

/** Best (maximum) mean value for each of the four metrics, across the given trainings. */
export function computeBestValues(trainingsWithMetrics: TrainingMetricsData[]): BestValidationValues {
  const best: BestValidationValues = {
    meanIoU: -Infinity,
    meanPrecision: -Infinity,
    meanRecall: -Infinity,
    meanF1: -Infinity
  };

  trainingsWithMetrics.forEach(({ metrics }) => {
    if (!metrics) return;
    (['meanIoU', 'meanPrecision', 'meanRecall', 'meanF1'] as const).forEach(key => {
      const mean = metrics[key]?.mean;
      if (mean !== undefined && mean > best[key]) {
        best[key] = mean;
      }
    });
  });

  return best;
}

export function formatNumber(value: number | undefined, decimals: number = 4): string {
  if (typeof value === 'number' && !isNaN(value)) {
    return value.toFixed(decimals);
  }
  return 'N/A';
}

export function formatMeanStd(metric: { mean: number; std: number } | undefined, decimals: number = 2): string {
  if (!metric) return 'N/A';
  return `${formatNumber(metric.mean, decimals)} ± ${formatNumber(metric.std, decimals)}`;
}

/** Renders the validation metrics table as a LaTeX table*, bolding each column's best value. */
export function generateValidationMetricsLatex(
  trainingsWithMetrics: TrainingMetricsData[],
  bestValues: BestValidationValues,
  decimals: number,
  multiplier: number
): string {
  let latex = `\\begin{table*}[t]\n\\centering\n\\caption{Training Validation Metrics (Top 10 Epochs by IoU)}\n\\label{tab:validation_metrics}\n\\begin{tabular}{|l|c|c|c|c|}\n\\hline\n`;
  latex += 'Training & Val mIoU & Precision & Recall & F1 \\\\\n\\hline\n';

  const columns: Array<{ key: keyof ValidationMetrics; best: number }> = [
    { key: 'meanIoU', best: bestValues.meanIoU },
    { key: 'meanPrecision', best: bestValues.meanPrecision },
    { key: 'meanRecall', best: bestValues.meanRecall },
    { key: 'meanF1', best: bestValues.meanF1 }
  ];

  trainingsWithMetrics.forEach(trainingData => {
    const trainingName = trainingData.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
    latex += `${trainingName} `;

    columns.forEach(({ key, best }) => {
      const metric = trainingData.metrics?.[key];
      if (metric) {
        const isBest = metric.mean === best;
        const boldStart = isBest ? '\\textbf{' : '';
        const boldEnd = isBest ? '}' : '';
        latex += `& ${boldStart}${(metric.mean * multiplier).toFixed(decimals)} ± ${(metric.std * multiplier).toFixed(decimals)}${boldEnd} `;
      } else {
        latex += '& N/A ';
      }
    });

    latex += '\\\\ \\hline\n';
  });

  latex += '\\end{tabular}\n\\end{table*}';
  return latex;
}
