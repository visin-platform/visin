import { describe, expect, it } from 'vitest';
import type { Epoch } from '../types/epoch';
import { formatRemaining, inferencePace, isInferenceRun, progressPercent, progressSeries, progressText } from './inferenceRun';

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 18, 0, minutes)).toISOString();

describe('inference run helpers', () => {
  it('tells an inference run from a training run, including older runs with no kind', () => {
    expect(isInferenceRun({ kind: 'inference' })).toBe(true);
    expect(isInferenceRun({ kind: 'training' })).toBe(false);
    expect(isInferenceRun({})).toBe(false);
    expect(isInferenceRun(undefined)).toBe(false);
  });

  it('says how far a run has got in frames, and nothing when it reports no progress', () => {
    const training = { progress: { done: 1234, total: 4110, unit: 'frame' as const } };
    expect(progressText(training)).toBe(`${(1234).toLocaleString()} / ${(4110).toLocaleString()} frames`);
    expect(progressPercent(training)).toBeCloseTo(30.02, 2);
    expect(progressText({})).toBeNull();
    expect(progressPercent({})).toBeNull();
    expect(progressPercent({ progress: { done: 5, total: 0, unit: 'frame' } })).toBeNull();
  });

  it('measures the pace between progress points, not from zero, so frames recovered on resume do not count', () => {
    const training = { progress: { done: 600, total: 1000, unit: 'frame' as const } };
    // Resumed with 500 frames already on disk: 100 frames in 60 minutes is 100 per hour, 4 hours left.
    const pace = inferencePace(training, [{ epoch: 600, timestamp: at(60) }, { epoch: 500, timestamp: at(0) }]);
    expect(pace?.perHour).toBeCloseTo(100);
    expect(pace?.remainingMs).toBeCloseTo(4 * 3_600_000);
  });

  it('gives no pace from a single point, no time, no frames or no progress', () => {
    const training = { progress: { done: 10, total: 100, unit: 'frame' as const } };
    expect(inferencePace(training, [{ epoch: 10, timestamp: at(0) }])).toBeNull();
    expect(inferencePace(training, [{ epoch: 5, timestamp: at(0) }, { epoch: 10, timestamp: at(0) }])).toBeNull();
    expect(inferencePace(training, [{ epoch: 10, timestamp: at(0) }, { epoch: 10, timestamp: at(5) }])).toBeNull();
    expect(inferencePace(training, [{ epoch: 5, timestamp: 'not a date' }, { epoch: 10, timestamp: at(5) }])).toBeNull();
    expect(inferencePace({}, [{ epoch: 5, timestamp: at(0) }, { epoch: 10, timestamp: at(5) }])).toBeNull();
  });

  it('formats time left the way a person would say it', () => {
    expect(formatRemaining(10_000)).toBe('under a minute');
    expect(formatRemaining(45 * 60_000)).toBe('45 min');
    expect(formatRemaining(3 * 3_600_000)).toBe('3 h');
    expect(formatRemaining(3 * 3_600_000 + 20 * 60_000)).toBe('3 h 20 min');
    expect(formatRemaining(5 * 24 * 3_600_000)).toBe('5 days');
  });

  it('turns progress points into series by unit, with gaps where a point did not report', () => {
    // Results are open blobs: whatever the run sent, which the typed shape of a training epoch does not describe.
    const { frames, series } = progressSeries([
      { epoch: 50, results: { degenerate_rate: 0.02, reject_rate: { first: 0.1, second: 0.3 }, latency_ms: 3500, tokens: 12 } },
      { epoch: 25, results: { degenerate_rate: 0.01, reject_rate: { first: 0.2 }, system_info: { cpu: 3 }, note: 'text', list: [1] } }
    ] as unknown as Pick<Epoch, 'epoch' | 'results'>[]);
    expect(frames).toEqual([25, 50]);
    expect(series).toEqual([
      { id: 'degenerate_rate', label: 'Degenerate rate', unit: 'rate', data: [0.01, 0.02] },
      { id: 'reject_rate.first', label: 'Reject rate · first', unit: 'rate', data: [0.2, 0.1] },
      { id: 'reject_rate.second', label: 'Reject rate · second', unit: 'rate', data: [null, 0.3] },
      { id: 'latency_ms', label: 'Latency', unit: 'ms', data: [null, 3500] },
      { id: 'tokens', label: 'Tokens', unit: 'value', data: [null, 12] }
    ]);
  });

  it('has nothing to chart for a run without points or results', () => {
    expect(progressSeries([])).toEqual({ frames: [], series: [] });
    expect(progressSeries([{ epoch: 1, results: undefined as unknown as Record<string, never> }]).series).toEqual([]);
  });
});
