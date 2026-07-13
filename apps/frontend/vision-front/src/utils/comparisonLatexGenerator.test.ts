import { describe, it, expect } from 'vitest';
import { formatTime, formatNumber, getStatusColor, generateLatexTable } from './comparisonLatexGenerator';
import type { TrainingComparison, ComparisonEpoch } from '@/types';

describe('formatTime', () => {
  it('formats seconds, minutes, hours, and days', () => {
    expect(formatTime(45)).toBe('45s');
    expect(formatTime(90)).toBe('1.5m');
    expect(formatTime(7200)).toBe('2.0h');
    expect(formatTime(172800)).toBe('2.0d');
  });
});

describe('formatNumber', () => {
  it('scales and formats a numeric value', () => {
    expect(formatNumber(0.8567, 2, 100)).toBe('85.67');
    expect(formatNumber(0.5, 1, 10)).toBe('5.0');
  });

  it('returns N/A for non-numeric or NaN input', () => {
    expect(formatNumber(undefined)).toBe('N/A');
    expect(formatNumber(NaN)).toBe('N/A');
    expect(formatNumber('x' as unknown as number)).toBe('N/A');
  });
});

describe('getStatusColor', () => {
  it('maps known statuses to MUI colors', () => {
    expect(getStatusColor('completed')).toBe('success');
    expect(getStatusColor('running')).toBe('default');
    expect(getStatusColor('failed')).toBe('error');
    expect(getStatusColor('pending')).toBe('default');
  });

  it('defaults unknown statuses to "default"', () => {
    expect(getStatusColor('mystery')).toBe('default');
  });
});

describe('generateLatexTable', () => {
  const epoch = (epochNum: number, valMeanIoU: number, overrides: Record<string, unknown> = {}): ComparisonEpoch =>
    ({
      epoch: epochNum,
      epoch_time: 60,
      timestamp: '2026-01-01T00:00:00Z',
      results: { val: { mean_iou: valMeanIoU, loss: 0.1 }, train: { loss: 0.05, mean_iou: valMeanIoU + 0.05 } },
      ...overrides,
    } as unknown as ComparisonEpoch);

  const makeComparison = (overrides: Partial<TrainingComparison> = {}): TrainingComparison =>
    ({
      training: {
        _id: 't1',
        name: 'Run & Test_1',
        status: 'completed',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
      metrics: {
        totalEpochs: 2,
        totalTime: 3600,
        avgEpochTime: 60,
        maxEpochTime: 90,
        cost: { totalHours: 1, cpuCost: 0.1, gpuCost: 0.2, totalCost: 0.3 },
      },
      lastEpoch: null,
      epochs: [epoch(1, 0.6), epoch(2, 0.8)],
      aggregatedTestResults: null,
      testResultsCount: 0,
      benchmarks: [],
      ...overrides,
    } as unknown as TrainingComparison);

  it('returns an empty string for no comparison data', () => {
    expect(generateLatexTable([], () => null)).toBe('');
  });

  it('escapes LaTeX special characters in training names', () => {
    const latex = generateLatexTable([makeComparison()], () => null);

    expect(latex).toContain('Run \\& Test\\_1');
  });

  it('reports the best epoch and best/average validation mIoU', () => {
    const latex = generateLatexTable([makeComparison()], () => null);

    expect(latex).toContain('Best Epoch');
    expect(latex).toContain('& 2 ');
    expect(latex).toContain('Best Val mIoU');
  });

  it('reports N/A when no epochs have validation mIoU data', () => {
    const noMiou = makeComparison({
      epochs: [epoch(1, undefined as unknown as number, { results: {} })],
    });

    const latex = generateLatexTable([noMiou], () => null);

    expect(latex).toContain('N/A');
  });

  it('adds the "Selected Epoch Results" section, including per-class metrics, when a selection exists', () => {
    const selected: ComparisonEpoch = epoch(2, 0.8, {
      results: {
        train: { loss: 0.05 },
        val: {
          loss: 0.1,
          mean_iou: 0.8,
          car: { iou: 0.7, precision: 0.6, recall: 0.5, f1: 0.55 },
          person: { iou: 0.9, precision: 0.8, recall: 0.7, f1: 0.75 },
        },
      },
    });

    const latex = generateLatexTable([makeComparison()], () => selected);

    expect(latex).toContain('Selected Epoch Results');
    expect(latex).toContain('Per-Class Metrics (Validation)');
    expect(latex).toContain('Car');
    expect(latex).toContain('\\textbf{');
  });

  it('omits the selected-epoch section when no comparison has a selection', () => {
    const latex = generateLatexTable([makeComparison()], () => null);

    expect(latex).not.toContain('Selected Epoch Results');
  });
});
