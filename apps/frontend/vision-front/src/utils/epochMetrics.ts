import type { ComparisonEpoch, TrainingComparison } from '@/types';

export interface MeanStd {
  mean: number;
  std: number;
}

export const getValMeanIoU = (epoch: ComparisonEpoch): number | undefined =>
  epoch.results?.val?.mean_iou;

export const getBestEpoch = (comparison: TrainingComparison): ComparisonEpoch | null => {
  if (comparison.epochs.length === 0) {
    return null;
  }

  return comparison.epochs.reduce((best, epoch) => {
    const currentVmIoU = getValMeanIoU(epoch) ?? -Infinity;
    const bestVmIoU = getValMeanIoU(best) ?? -Infinity;
    return currentVmIoU > bestVmIoU ? epoch : best;
  }, comparison.epochs[0]);
};

export const getBestValMeanIoU = (comparison: TrainingComparison): number => {
  const best = Math.max(...comparison.epochs.map((epoch) => getValMeanIoU(epoch) ?? -Infinity));
  return best;
};

const getTopValMeanIoUs = (comparison: TrainingComparison, count: number) =>
  comparison.epochs
    .map(getValMeanIoU)
    .filter((vmIoU): vmIoU is number => vmIoU !== undefined)
    .sort((a, b) => b - a)
    .slice(0, count);

export const getMeanAndStd = (values: number[]): MeanStd | null => {
  if (values.length === 0) {
    return null;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;

  return {
    mean,
    std: Math.sqrt(variance)
  };
};

export const getTop10ValMeanIoUStats = (comparison: TrainingComparison): MeanStd | null =>
  getMeanAndStd(getTopValMeanIoUs(comparison, 10));

export const getTop10ValMeanIoU = (comparison: TrainingComparison): number =>
  getTop10ValMeanIoUStats(comparison)?.mean ?? -Infinity;
