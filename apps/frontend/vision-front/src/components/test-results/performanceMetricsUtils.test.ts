import { describe, it, expect } from 'vitest';
import {
  getBestValues,
  sortComparisonData,
  formatMetricNumber,
  generateConditionLatex,
  type ComparisonData
} from './performanceMetricsUtils';

const makeComparison = (id: string, name: string, iou: number, precision?: number): ComparisonData => ({
  training: { _id: id, name },
  testResultsCount: 1,
  aggregatedResults: {
    day_fair: {
      human: {
        iou: { mean: iou },
        ...(precision !== undefined && { precision: { mean: precision } })
      },
      overall: { fw_iou: { mean: iou } }
    }
  }
});

describe('getBestValues', () => {
  it('returns the maximum mean per metric across all trainings', () => {
    const data = [makeComparison('a', 'A', 0.5), makeComparison('b', 'B', 0.8)];
    expect(getBestValues(data, 'day_fair', 'human').iou).toBe(0.8);
  });

  it('ignores trainings missing that class entirely', () => {
    const withoutHuman: ComparisonData = {
      training: { _id: 'c', name: 'C' },
      testResultsCount: 1,
      aggregatedResults: { day_fair: {} }
    };
    const data = [makeComparison('a', 'A', 0.5), withoutHuman];
    expect(getBestValues(data, 'day_fair', 'human').iou).toBe(0.5);
  });

  it('returns an empty object when no training has a value for that metric', () => {
    const data = [{ training: { _id: 'a', name: 'A' }, testResultsCount: 0, aggregatedResults: {} }];
    expect(getBestValues(data, 'day_fair', 'human')).toEqual({});
  });
});

describe('sortComparisonData', () => {
  const data = [makeComparison('a', 'Zebra', 0.9), makeComparison('b', 'Apple', 0.5)];

  it('sorts by training name alphabetically, ascending', () => {
    const sorted = sortComparisonData(data, 'day_fair', 'training', 'asc');
    expect(sorted.map(d => d.training.name)).toEqual(['Apple', 'Zebra']);
  });

  it('sorts by training name descending', () => {
    const sorted = sortComparisonData(data, 'day_fair', 'training', 'desc');
    expect(sorted.map(d => d.training.name)).toEqual(['Zebra', 'Apple']);
  });

  it('sorts by a "<class>_<metric>" column numerically', () => {
    const sorted = sortComparisonData(data, 'day_fair', 'human_iou', 'asc');
    expect(sorted.map(d => d.training.name)).toEqual(['Apple', 'Zebra']);
  });

  it('sorts by the overall_fw_iou column', () => {
    const sorted = sortComparisonData(data, 'day_fair', 'overall_fw_iou', 'desc');
    expect(sorted.map(d => d.training.name)).toEqual(['Zebra', 'Apple']);
  });

  it('treats a missing metric value as -Infinity, sorting it last ascending', () => {
    const missing: ComparisonData = { training: { _id: 'c', name: 'Missing' }, testResultsCount: 0, aggregatedResults: {} };
    const sorted = sortComparisonData([...data, missing], 'day_fair', 'human_iou', 'asc');
    expect(sorted[0].training.name).toBe('Missing');
  });
});

describe('formatMetricNumber', () => {
  it('formats a numeric value with the given decimals and multiplier', () => {
    expect(formatMetricNumber(0.5, 2, 100)).toBe('50.00');
  });

  it('returns N/A for undefined', () => {
    expect(formatMetricNumber(undefined, 4, 1)).toBe('N/A');
  });

  it('returns N/A for NaN', () => {
    expect(formatMetricNumber(NaN, 4, 1)).toBe('N/A');
  });
});

describe('generateConditionLatex', () => {
  it('bolds the best value per metric and marks missing ones N/A', () => {
    const data = [makeComparison('a', 'A', 0.5), makeComparison('b', 'B', 0.8)];
    const latex = generateConditionLatex(data, 'day_fair', 2, 1);

    expect(latex).toContain('\\textbf{0.80}');
    expect(latex).toContain('0.50');
    expect(latex).toContain('& N/A');
  });

  it('escapes LaTeX-special characters in training names', () => {
    const special = makeComparison('a', 'Run_1 & Test', 0.5);
    const latex = generateConditionLatex([special], 'day_fair', 2, 1);
    expect(latex).toContain('Run\\_1 \\& Test');
  });
});
