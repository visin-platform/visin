import { describe, it, expect } from 'vitest';
import { generateLatexCode, generateAggregatedLatexCode } from './latexGenerator';
import type { TestResult } from '../types';

const metric = (v: number) => ({ iou: v, precision: v, recall: v, ap: v });

const makeTestResult = (overrides: Record<string, unknown> = {}): TestResult =>
  ({
    _id: 'tr1',
    test_results: {
      day_fair: {
        vehicle: metric(0.8),
        sign: metric(0.6),
        human: metric(0.4),
        'cyclist + pedestrian': metric(0.5),
        overall: { mIoU_foreground: 0.5, mean_accuracy: 0.6, fw_iou: 0.7, pixel_accuracy: 0.9 },
        inference_time: { avg_per_sample_ms: 12.3, throughput_fps: 30.1, total_seconds: 100.5 },
      },
    },
    ...overrides,
  } as unknown as TestResult);

describe('generateLatexCode', () => {
  it('renders a LaTeX table row with all metrics for a populated condition', () => {
    const latex = generateLatexCode(makeTestResult());

    expect(latex).toContain('\\begin{table*}[ht]');
    expect(latex).toContain('0.8000');
    expect(latex).toContain('12.30');
    expect(latex).toContain('\\end{table*}');
  });

  it('renders "-" placeholders for missing classes/overall/inference data', () => {
    const latex = generateLatexCode(makeTestResult({ test_results: { day_fair: {} } }));

    expect(latex).toContain(' - & - & - & - ');
  });

  it('skips conditions entirely absent from test_results', () => {
    const latex = generateLatexCode(makeTestResult({ test_results: {} }));

    expect(latex).not.toContain('Dry day');
  });
});

describe('generateAggregatedLatexCode', () => {
  const aggregatedStats = {
    day_fair: {
      vehicle: { iou: { mean: 0.8 }, precision: { mean: 0.7 }, recall: { mean: 0.6 }, ap: { mean: 0.5 } },
      sign: { iou: { mean: 0.4 }, precision: { mean: 0.3 }, recall: { mean: 0.2 }, ap: { mean: 0.1 } },
      human: { iou: { mean: 0.9 }, precision: { mean: 0.9 }, recall: { mean: 0.9 }, ap: { mean: 0.9 } },
    },
  };

  it('bolds the best value per metric/class and singularizes the caption for one run', () => {
    const latex = generateAggregatedLatexCode(aggregatedStats, false, 1);

    expect(latex).not.toContain('of 1 total');
    expect(latex).toContain('\\textbf{0.80}');
    expect(latex).toContain('Vehicle');
    expect(latex).not.toContain('Cyclist');
  });

  it('includes the cyclist+pedestrian class when present and notes the run count', () => {
    const withCyclist = {
      day_fair: {
        ...aggregatedStats.day_fair,
        'cyclist + pedestrian': { iou: { mean: 0.5 }, precision: { mean: 0.5 }, recall: { mean: 0.5 }, ap: { mean: 0.5 } },
      },
    };

    const latex = generateAggregatedLatexCode(withCyclist, true, 3);

    expect(latex).toContain('of 3 total');
    expect(latex).toContain('Cyclist + pedestrian');
  });

  it('renders "-" for missing metric data and skips absent conditions', () => {
    const latex = generateAggregatedLatexCode({ day_fair: {} }, false, 1);

    expect(latex).toContain('- & - & -');
  });

  it('handles an empty aggregatedStats object', () => {
    const latex = generateAggregatedLatexCode({}, false, 1);

    expect(latex).toContain('\\end{table*}');
  });
});
