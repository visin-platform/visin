import { describe, expect, it } from 'vitest';
import {
  getBestEpoch,
  getBestValMeanIoU,
  getTop10ValMeanIoU,
  getTop10ValMeanIoUStats
} from './epochMetrics';
import type { ComparisonEpoch, TrainingComparison } from '@/types';

const epoch = (epochNumber: number, meanIoU?: number): ComparisonEpoch => ({
  epoch: epochNumber,
  timestamp: '2026-01-01T00:00:00Z',
  results: meanIoU === undefined ? {} : { val: { mean_iou: meanIoU } }
});

const comparison = (epochs: ComparisonEpoch[]): TrainingComparison => ({
  training: { _id: 't1', name: 'Run', status: 'completed', createdAt: '', updatedAt: '' },
  metrics: {
    totalEpochs: epochs.length,
    totalTime: 0,
    avgEpochTime: 0,
    maxEpochTime: 0,
    cost: { totalHours: 0, cpuCost: 0, gpuCost: 0, totalCost: 0 }
  },
  lastEpoch: null,
  epochs,
  aggregatedTestResults: null,
  testResultsCount: 0,
  benchmarks: []
});

describe('epochMetrics', () => {
  it('finds the epoch with the best validation mIoU', () => {
    const comp = comparison([epoch(1, 0.4), epoch(2, 0.9), epoch(3, 0.8)]);

    expect(getBestEpoch(comp)?.epoch).toBe(2);
    expect(getBestValMeanIoU(comp)).toBe(0.9);
  });

  it('keeps the first epoch as best when no validation mIoU exists', () => {
    const comp = comparison([epoch(1), epoch(2)]);

    expect(getBestEpoch(comp)?.epoch).toBe(1);
    expect(getBestValMeanIoU(comp)).toBe(-Infinity);
  });

  it('returns no best epoch and -Infinity mIoU for empty epoch lists', () => {
    const comp = comparison([]);

    expect(getBestEpoch(comp)).toBeNull();
    expect(getBestValMeanIoU(comp)).toBe(-Infinity);
    expect(getTop10ValMeanIoU(comp)).toBe(-Infinity);
  });

  it('averages and computes std across up to the top 10 validation mIoUs', () => {
    const comp = comparison([
      epoch(1, 0.1),
      epoch(2, 0.9),
      epoch(3, 0.5)
    ]);

    expect(getTop10ValMeanIoU(comp)).toBeCloseTo(0.5);
    expect(getTop10ValMeanIoUStats(comp)).toEqual({
      mean: 0.5,
      std: expect.closeTo(0.326598632)
    });
  });
});
