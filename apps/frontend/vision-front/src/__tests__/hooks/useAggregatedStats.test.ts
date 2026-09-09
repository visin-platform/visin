import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAggregatedStats } from '../../hooks/useAggregatedStats';
import type { TestResult } from '../../types';

const makeTestResult = (overrides: Record<string, unknown> = {}): TestResult =>
  ({
    _id: 'tr-1',
    test_results: {
      day_fair: {
        vehicle: { iou: 0.8, precision: 0.9, recall: 0.7, ap: 0.85 },
        sign: { iou: 0.6, precision: 0.7, recall: 0.5, ap: 0.65 },
        human: { iou: 0.4, precision: 0.5, recall: 0.3, ap: 0.45 },
      },
    },
    ...overrides,
  } as unknown as TestResult);

describe('useAggregatedStats', () => {
  it('returns null aggregatedStats when given an empty array', () => {
    const { result } = renderHook(() => useAggregatedStats([]));
    expect(result.current.aggregatedStats).toBeNull();
  });

  it('picks up a multi-word class without it being special-cased', () => {
    const testResult = makeTestResult({
      test_results: {
        day_fair: { 'cyclist + pedestrian': { iou: 0.5, precision: 0.6, recall: 0.4, ap: 0.55 } },
      },
    });
    const { result } = renderHook(() => useAggregatedStats([testResult]));

    expect(result.current.aggregatedStats!['day_fair']['cyclist + pedestrian'].iou.mean).toBeCloseTo(0.5);
  });

  it('aggregates a vocabulary the platform has never seen', () => {
    const factory = makeTestResult({
      test_results: {
        line_a: { scratch: { iou: 0.4, precision: 0.5 }, dent: { iou: 0.9 } },
      },
    });
    const { result } = renderHook(() => useAggregatedStats([factory]));
    const stats = result.current.aggregatedStats!;

    expect(Object.keys(stats)).toEqual(['line_a']);
    expect(stats['line_a']['scratch'].iou.mean).toBeCloseTo(0.4);
    expect(stats['line_a']['dent'].iou.mean).toBeCloseTo(0.9);
  });

  it('computes the mean IoU for a single result correctly', () => {
    const { result } = renderHook(() => useAggregatedStats([makeTestResult()]));
    const stats = result.current.aggregatedStats;

    expect(stats).not.toBeNull();
    expect(stats!['day_fair']['vehicle'].iou.mean).toBeCloseTo(0.8);
    expect(stats!['day_fair']['vehicle'].iou.values).toEqual([0.8]);
  });

  it('averages metrics across multiple test results', () => {
    const r1 = makeTestResult();
    const r2 = makeTestResult({
      test_results: {
        day_fair: {
          vehicle: { iou: 0.6, precision: 0.7, recall: 0.5, ap: 0.65 },
          sign: { iou: 0.4, precision: 0.5, recall: 0.3, ap: 0.45 },
          human: { iou: 0.2, precision: 0.3, recall: 0.1, ap: 0.25 },
        },
      },
    });

    const { result } = renderHook(() => useAggregatedStats([r1, r2]));
    const vehicleIou = result.current.aggregatedStats!['day_fair']['vehicle'].iou;

    expect(vehicleIou.values).toHaveLength(2);
    expect(vehicleIou.mean).toBeCloseTo(0.7); // (0.8 + 0.6) / 2
  });

  it('omits a condition the data never mentions, rather than inventing zeroes', () => {
    const { result } = renderHook(() => useAggregatedStats([makeTestResult()]));
    const stats = result.current.aggregatedStats!;

    expect(Object.keys(stats)).toEqual(['day_fair']);
    expect(stats['night_fair']).toBeUndefined();
  });

  it('leaves a metric a class never reported at zero with no values', () => {
    const { result } = renderHook(() => useAggregatedStats([makeTestResult()]));
    // the fixture reports no f1_score anywhere
    const vehicle = result.current.aggregatedStats!['day_fair']['vehicle'];

    expect(vehicle.f1_score.values).toHaveLength(0);
    expect(vehicle.f1_score.mean).toBe(0);
  });
});
