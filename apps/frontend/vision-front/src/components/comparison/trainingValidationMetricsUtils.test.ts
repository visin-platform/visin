import { describe, it, expect } from 'vitest';
import {
  computeTrainingMetrics,
  sortTrainingsWithMetrics,
  computeBestValues,
  formatNumber,
  formatMeanStd,
  generateValidationMetricsLatex
} from './trainingValidationMetricsUtils';
import type { TrainingComparison } from '../../types';

const makeEpoch = (mean_iou: number, precision = 0.5, recall = 0.5): TrainingComparison['epochs'][number] => ({
  epoch: 1,
  timestamp: new Date().toISOString(),
  results: {
    val: {
      mean_iou,
      human: { precision, recall, f1_score: 0.5 }
    }
  }
});

const makeTraining = (id: string, name: string, epochs: TrainingComparison['epochs']): TrainingComparison => ({
  training: { _id: id, name, status: 'completed', createdAt: '', updatedAt: '' },
  metrics: { totalEpochs: epochs.length, totalTime: 0, avgEpochTime: 0, maxEpochTime: 0, cost: { totalHours: 0, cpuCost: 0, gpuCost: 0, totalCost: 0 } },
  lastEpoch: epochs[epochs.length - 1] ?? null,
  epochs,
  aggregatedTestResults: null,
  testResultsCount: 0,
  benchmarks: []
});

describe('computeTrainingMetrics', () => {
  it('returns null metrics for a training with no epochs', () => {
    const result = computeTrainingMetrics([makeTraining('a', 'A', [])]);
    expect(result[0].metrics).toBeNull();
  });

  it('returns null metrics when no epoch has a val.mean_iou', () => {
    const epoch = { epoch: 1, timestamp: '', results: { val: { loss: 0.1 } } };
    const result = computeTrainingMetrics([makeTraining('a', 'A', [epoch])]);
    expect(result[0].metrics).toBeNull();
  });

  it('averages mean_iou across up to the top 10 epochs by IoU', () => {
    const epochs = [makeEpoch(0.6), makeEpoch(0.8)];
    const result = computeTrainingMetrics([makeTraining('a', 'A', epochs)]);
    expect(result[0].metrics?.meanIoU?.mean).toBeCloseTo(0.7);
  });

  it('averages precision/recall/f1 across classes within an epoch, then across epochs', () => {
    const epochs = [makeEpoch(0.5, 0.4, 0.6), makeEpoch(0.5, 0.8, 0.6)];
    const result = computeTrainingMetrics([makeTraining('a', 'A', epochs)]);
    expect(result[0].metrics?.meanPrecision?.mean).toBeCloseTo(0.6);
  });

  it('only considers the top 10 epochs by IoU when more are present', () => {
    const epochs = Array.from({ length: 12 }, (_, i) => makeEpoch(i / 100));
    const result = computeTrainingMetrics([makeTraining('a', 'A', epochs)]);
    // Top 10 by IoU are 0.02..0.11, mean = 0.065
    expect(result[0].metrics?.meanIoU?.mean).toBeCloseTo(0.065);
  });
});

describe('sortTrainingsWithMetrics', () => {
  const data = [
    { training: { _id: 'a', name: 'A' } as any, metrics: { meanIoU: { mean: 0.5, std: 0 } } },
    { training: { _id: 'b', name: 'B' } as any, metrics: { meanIoU: { mean: 0.9, std: 0 } } },
    { training: { _id: 'c', name: 'C' } as any, metrics: null }
  ];

  it('drops trainings with null metrics', () => {
    const sorted = sortTrainingsWithMetrics(data, 'meanIoU', 'desc');
    expect(sorted).toHaveLength(2);
  });

  it('sorts descending by mean value', () => {
    const sorted = sortTrainingsWithMetrics(data, 'meanIoU', 'desc');
    expect(sorted.map(d => d.training._id)).toEqual(['b', 'a']);
  });

  it('sorts by training name when column is "training"', () => {
    const sorted = sortTrainingsWithMetrics(data, 'training', 'asc');
    expect(sorted.map(d => d.training._id)).toEqual(['a', 'b']);
  });
});

describe('computeBestValues', () => {
  it('finds the max mean per metric, ignoring missing ones', () => {
    const data = [
      { training: {} as any, metrics: { meanIoU: { mean: 0.5, std: 0 }, meanF1: { mean: 0.3, std: 0 } } },
      { training: {} as any, metrics: { meanIoU: { mean: 0.9, std: 0 } } }
    ];
    const best = computeBestValues(data);
    expect(best.meanIoU).toBe(0.9);
    expect(best.meanF1).toBe(0.3);
    expect(best.meanRecall).toBe(-Infinity);
  });
});

describe('formatNumber / formatMeanStd', () => {
  it('formats a number to the given decimals', () => {
    expect(formatNumber(0.12345, 2)).toBe('0.12');
  });

  it('returns N/A for undefined', () => {
    expect(formatNumber(undefined)).toBe('N/A');
  });

  it('formats mean ± std', () => {
    expect(formatMeanStd({ mean: 0.5, std: 0.1 }, 2)).toBe('0.50 ± 0.10');
  });

  it('returns N/A when the metric itself is undefined', () => {
    expect(formatMeanStd(undefined)).toBe('N/A');
  });
});

describe('generateValidationMetricsLatex', () => {
  it('bolds the best value and marks missing metrics N/A', () => {
    const data = [
      { training: { _id: 'a', name: 'A' } as any, metrics: { meanIoU: { mean: 0.5, std: 0.1 } } },
      { training: { _id: 'b', name: 'B' } as any, metrics: { meanIoU: { mean: 0.9, std: 0.1 } } }
    ];
    const best = computeBestValues(data);
    const latex = generateValidationMetricsLatex(data, best, 2, 100);

    expect(latex).toContain('\\textbf{90.00 ± 10.00}');
    expect(latex).toContain('& N/A');
  });
});
