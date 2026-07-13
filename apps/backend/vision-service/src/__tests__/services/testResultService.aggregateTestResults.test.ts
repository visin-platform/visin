import { testResultService } from '../../services/testResultService';
import type { MetricStat } from '../../services/testResultService';

// aggregateTestResults is pure (no DB access), unlike the rest of the
// service, so it's tested directly without mocking Mongoose models.
//
// Its return shape is only concretely typed two levels deep (condition ->
// class/overall/pseudo-key); everything below that is genuinely dynamic
// aggregation output, so tests narrow the specific sub-shape they assert on.
const asMetrics = (node: unknown) => node as Record<string, MetricStat>;

describe('testResultService.aggregateTestResults', () => {
  it('returns null for an empty input array', () => {
    expect(testResultService.aggregateTestResults([])).toBeNull();
  });

  it('computes mean and std for a single test result', () => {
    const result = testResultService.aggregateTestResults([
      {
        test_results: {
          rain: {
            car: { iou: 0.8, recall: 0.9, precision: 0.7, f1_score: 0.75, ap: 0.6 },
            overall: { mIoU_foreground: 0.5, mean_accuracy: 0.6, fw_iou: 0.7, pixel_accuracy: 0.9 }
          }
        }
      }
    ])!;

    expect(asMetrics(result.rain.car).iou).toEqual({ mean: 0.8, std: 0 });
    expect(asMetrics(result.rain.overall).mIoU_foreground).toEqual({ mean: 0.5, std: 0 });
  });

  it('averages a metric across multiple test results and computes population std dev', () => {
    const result = testResultService.aggregateTestResults([
      { test_results: { day: { car: { iou: 0.6 } } } },
      { test_results: { day: { car: { iou: 1.0 } } } }
    ])!;

    // mean = 0.8, population std = sqrt(((0.6-0.8)^2 + (1.0-0.8)^2) / 2) = 0.2
    expect(asMetrics(result.day.car).iou.mean).toBeCloseTo(0.8);
    expect(asMetrics(result.day.car).iou.std).toBeCloseTo(0.2);
  });

  it('excludes the "inference_time" pseudo-condition from per-condition aggregation', () => {
    const result = testResultService.aggregateTestResults([
      {
        test_results: {
          day: { car: { iou: 0.5 } },
          inference_time: { avg_per_sample_ms: 12 }
        }
      }
    ]);

    expect(result).toHaveProperty('day');
    expect(result).not.toHaveProperty('inference_time.car');
  });

  it('excludes classes named "inference_time" or prefixed with "mean_" from per-class metrics', () => {
    const result = testResultService.aggregateTestResults([
      {
        test_results: {
          day: {
            car: { iou: 0.5 },
            mean_car: { iou: 0.9 },
            inference_time: { iou: 0.1 }
          }
        }
      }
    ])!;

    expect(result.day).toHaveProperty('car');
    expect(result.day).not.toHaveProperty('mean_car');
    expect(result.day).not.toHaveProperty('inference_time');
  });

  it('ignores non-numeric and NaN metric values instead of propagating NaN', () => {
    const result = testResultService.aggregateTestResults([
      { test_results: { day: { car: { iou: 0.5 } } } },
      { test_results: { day: { car: { iou: NaN } } } },
      { test_results: { day: { car: { iou: 'not-a-number' as unknown as number } } } }
    ])!;

    // Only the single valid 0.5 sample should count, not the NaN/string ones
    expect(asMetrics(result.day.car).iou).toEqual({ mean: 0.5, std: 0 });
  });

  it('omits a class entirely when no test result has a valid value for any of its metrics', () => {
    const result = testResultService.aggregateTestResults([
      { test_results: { day: { car: { iou: NaN } } } }
    ])!;

    expect(result.day.car).toBeUndefined();
  });

  it('aggregates inference_time across conditions using avg_per_sample_ms', () => {
    const result = testResultService.aggregateTestResults([
      {
        test_results: {
          day: { inference_time: { avg_per_sample_ms: 10 } },
          night: { inference_time: { avg_per_sample_ms: 20 } }
        }
      }
    ])!;

    expect(asMetrics(result.inference_time).avg_per_sample_ms.mean).toBeCloseTo(15);
  });

  it('handles a class present in only some test results (missing values simply do not contribute)', () => {
    const result = testResultService.aggregateTestResults([
      { test_results: { day: { car: { iou: 0.4 }, truck: { iou: 0.8 } } } },
      { test_results: { day: { car: { iou: 0.6 } } } }
    ])!;

    expect(asMetrics(result.day.car).iou.mean).toBeCloseTo(0.5);
    expect(asMetrics(result.day.truck).iou.mean).toBeCloseTo(0.8);
    expect(asMetrics(result.day.truck).iou.std).toBeCloseTo(0);
  });
});
