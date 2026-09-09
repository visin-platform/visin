import { describe, it, expect } from 'vitest';
import { generateTrainingLatex, generateTestingLatex, generateBenchmarkingLatex } from './comparisonExportLatex';
import type { TrainingComparison, ComparisonEpoch } from '@/types';
import type { TestResultsDatum } from './comparisonExportLatex';
import { discoverAggregateVocabulary } from '@/components/test-results/aggregateVocabulary';
import { resolveTaxonomy } from '@/taxonomy/resolveTaxonomy';
import { DEFAULT_CLASS_METRICS } from '@/components/test-results/performanceMetricsUtils';

const epoch = (epochNum: number, valMeanIoU: number | undefined, valExtra: Record<string, unknown> = {}): ComparisonEpoch =>
  ({
    epoch: epochNum,
    epoch_time: 60,
    timestamp: '2026-01-01T00:00:00Z',
    results: {
      val: valMeanIoU === undefined ? undefined : { mean_iou: valMeanIoU, ...valExtra },
    },
  } as unknown as ComparisonEpoch);

const makeComparison = (overrides: Partial<TrainingComparison> = {}): TrainingComparison =>
  ({
    training: {
      _id: 't1',
      name: 'Run_1 & Test',
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
    epochs: [
      epoch(1, 0.6, { car: { iou: 0.5, precision: 0.4, recall: 0.3, f1_score: 0.35 } }),
      epoch(2, 0.8, { car: { iou: 0.7, precision: 0.6, recall: 0.5, f1: 0.55 } }),
    ],
    aggregatedTestResults: null,
    testResultsCount: 0,
    benchmarks: [],
    ...overrides,
  } as unknown as TrainingComparison);

describe('generateTrainingLatex', () => {
  it('returns an empty string for no comparison data', () => {
    expect(generateTrainingLatex([], 2, 100)).toBe('');
  });

  it('renders the detailed comparison table sorted by top-10 val mIoU', () => {
    const latex = generateTrainingLatex([makeComparison()], 2, 100);

    expect(latex).toContain('Detailed Training Comparison');
    expect(latex).toContain('Run\\_1 \\& Test');
  });

  it('adds the per-class IoU table when class-level validation data exists', () => {
    const latex = generateTrainingLatex([makeComparison()], 2, 100);

    expect(latex).toContain('Training Validation IoU per Class');
    expect(latex).toContain('car');
  });

  it('adds the validation metrics table (precision/recall/f1, supporting both f1 and f1_score keys)', () => {
    const latex = generateTrainingLatex([makeComparison()], 2, 100);

    expect(latex).toContain('Training Validation Metrics');
    expect(latex).toMatch(/Precision & Recall & F1/);
  });

  it('reports N/A for a training with no epochs at all', () => {
    const empty = makeComparison({ epochs: [] });

    const latex = generateTrainingLatex([empty], 2, 100);

    expect(latex).toContain('N/A');
    // No per-class data anywhere means the class IoU table is skipped entirely.
    expect(latex).not.toContain('Training Validation IoU per Class');
  });

  it('sorts multiple trainings by top-10 val mIoU and reports N/A per class for a training missing that class', () => {
    const strong = makeComparison({
      training: { _id: 't1', name: 'Strong', status: 'completed', createdAt: '', updatedAt: '' } as never,
      epochs: [epoch(1, 0.9, { car: { iou: 0.9, precision: 0.9, recall: 0.9, f1: 0.9 } })],
    });
    const weakNoClassData = makeComparison({
      training: { _id: 't2', name: 'Weak', status: 'completed', createdAt: '', updatedAt: '' } as never,
      epochs: [epoch(1, 0.2, {})],
    });

    const latex = generateTrainingLatex([weakNoClassData, strong], 2, 100);

    // "Strong" (higher avg val mIoU) should be listed before "Weak" in the detailed table.
    expect(latex.indexOf('Strong')).toBeLessThan(latex.indexOf('Weak'));
    // Weak has no per-class car data -> N/A in the per-class IoU table, Strong's is bolded (best).
    expect(latex).toContain('& N/A ');
    expect(latex).toContain('\\textbf{');
  });
});

describe('generateTestingLatex', () => {
  const datum: TestResultsDatum = {
    training: { _id: 't1', name: 'Run & 1', status: 'completed', createdAt: '', updatedAt: '' },
    aggregatedResults: {
      day_fair: {
        human: { iou: { mean: 0.5 }, precision: { mean: 0.6 }, recall: { mean: 0.7 }, f1_score: { mean: 0.65 }, ap: { mean: 0.55 } },
        sign: { iou: { mean: 0.4 } },
        vehicle: { iou: { mean: 0.8 } },
        overall: { fw_iou: { mean: 0.75 } },
      },
    },
    testResultsCount: 1,
  };

  /** Project config naming both conditions, so `snow` shows even with no data. */
  const taxonomyFor = (data: TestResultsDatum[]) =>
    discoverAggregateVocabulary(
      data,
      resolveTaxonomy(
        {
          conditions: [
            { key: 'day_fair', label: 'Day Fair', order: 0 },
            { key: 'snow', label: 'Snow', order: 1 }
          ]
        },
        {}
      ),
      DEFAULT_CLASS_METRICS
    ).taxonomy;

  it('returns an empty string for no test results data', () => {
    expect(generateTestingLatex([], 2, 100, taxonomyFor([]))).toBe('');
  });

  it('renders performance/IoU/AP tables per condition', () => {
    const latex = generateTestingLatex([datum], 2, 100, taxonomyFor([datum]));

    expect(latex).toContain('Performance Metrics - DAY FAIR');
    expect(latex).toContain('IoU Metrics - DAY FAIR');
    expect(latex).toContain('AP Metrics - DAY FAIR');
    expect(latex).toContain('Performance Metrics - SNOW');
  });

  it('escapes training names and reports N/A for conditions with no data', () => {
    const latex = generateTestingLatex([datum], 2, 100, taxonomyFor([datum]));

    expect(latex).toContain('Run \\& 1');
    // snow is configured but has no aggregatedResults entry, so its cells are N/A
    expect(latex).toMatch(/Performance Metrics - SNOW[\s\S]*N\/A/);
  });

  it('renders an unfamiliar vocabulary with no project config at all', () => {
    const factory: TestResultsDatum = {
      training: { _id: 't1', name: 'Run 1' },
      aggregatedResults: { line_a: { scratch: { iou: { mean: 0.4 } } } },
      testResultsCount: 1
    } as unknown as TestResultsDatum;
    const discovered = discoverAggregateVocabulary(
      [factory],
      resolveTaxonomy(undefined, {}),
      DEFAULT_CLASS_METRICS
    ).taxonomy;

    const latex = generateTestingLatex([factory], 2, 100, discovered);

    expect(latex).toContain('IoU Metrics - LINE A');
    expect(latex).toContain('Scratch IoU');
    expect(latex).not.toContain('DAY FAIR');
  });
});

describe('generateBenchmarkingLatex', () => {
  it('returns an empty string for no benchmarks data', () => {
    expect(generateBenchmarkingLatex([])).toBe('');
  });

  it('splits results into GPU and CPU tables by device_type/device', () => {
    const benchmarksData = [
      {
        training_name: 'Run_1',
        results: [
          { device_type: 'gpu', mean_time_ms: 10, std_time_ms: 1, fps: 20, gpu_memory_mean_mb: 512, gpu_memory_std_mb: 10 },
          { device: 'CPU-x86', mean_time_ms: 50, fps: 5, ram_memory_mean_mb: 256 },
        ],
      },
    ];

    const latex = generateBenchmarkingLatex(benchmarksData);

    expect(latex).toContain('GPU Benchmark Performance Comparison');
    expect(latex).toContain('CPU Benchmark Performance Comparison');
    expect(latex).toContain('Run\\_1');
  });

  it('treats results with no device info as GPU by default', () => {
    const benchmarksData = [{ training_name: 'Untagged', results: [{ mean_time_ms: 5 }] }];

    const latex = generateBenchmarkingLatex(benchmarksData);

    expect(latex).toContain('GPU Benchmark Performance Comparison');
    expect(latex).not.toContain('CPU Benchmark Performance Comparison');
  });

  it('omits GPU/CPU sections that have no matching results', () => {
    const benchmarksData = [{ training_name: 'CpuOnly', results: [{ device_type: 'cpu', mean_time_ms: 5 }] }];

    const latex = generateBenchmarkingLatex(benchmarksData);

    expect(latex).not.toContain('GPU Benchmark Performance Comparison');
    expect(latex).toContain('CPU Benchmark Performance Comparison');
  });
});
