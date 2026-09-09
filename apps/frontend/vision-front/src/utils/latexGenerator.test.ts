import { describe, it, expect } from 'vitest';
import { generateLatexCode } from './latexGenerator';
import { resolveTaxonomyFor } from '../taxonomy/useTaxonomy';
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

  it('renders "-" placeholders for a condition carrying no metrics', () => {
    const result = makeTestResult({
      test_results: { day_fair: { vehicle: metric(0.8) }, snow: {} },
    });
    const latex = generateLatexCode(result);

    expect(latex).toContain('-');
    expect(latex).toContain('Snow');
  });

  it('skips conditions entirely absent from test_results', () => {
    const latex = generateLatexCode(makeTestResult({ test_results: {} }));

    expect(latex).not.toContain('Day Fair');
    expect(latex).toContain('\\end{table*}');
  });

  it('sizes the table to the classes present rather than a fixed four', () => {
    const twoClasses = makeTestResult({
      test_results: { line_a: { scratch: metric(0.4), dent: metric(0.9) } },
    });
    const latex = generateLatexCode(twoClasses);

    // 2 classes x 4 metrics, no overall/inference block in this payload
    expect(latex).toContain('\\multicolumn{2}{|c|}{IoU}');
    expect(latex).toContain('Scratch & Dent');
    expect(latex).toContain('Line A');
    expect(latex).not.toContain('Vehicle');
  });

  it('uses a project taxonomy for labels and the condition-axis wording', () => {
    const result = makeTestResult({
      test_results: { line_a: { scratch: metric(0.4) } },
    });
    const taxonomy = resolveTaxonomyFor(
      {
        conditionLabel: 'Line',
        conditions: [{ key: 'line_a', label: 'Line A' }],
        classes: [{ key: 'scratch', label: 'Surface Scratch' }],
      },
      [result]
    );

    const latex = generateLatexCode(result, taxonomy);

    expect(latex).toContain('Surface Scratch');
    expect(latex).toContain('across lines.');
  });

  it('escapes LaTeX-special characters in a class label', () => {
    // humanize turns underscores into spaces, so use a character it leaves alone
    const result = makeTestResult({
      test_results: { line_a: { 'r&d': metric(0.4) } },
    });
    const latex = generateLatexCode(result);

    expect(latex).toContain('R\\&d');
  });
});
