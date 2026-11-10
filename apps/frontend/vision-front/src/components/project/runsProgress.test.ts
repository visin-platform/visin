import { describe, expect, it } from 'vitest';
import type { RankedRun } from '../../types/bestRun';
import { barShare, progressOverTime } from './runsProgress';

const run = (id: string, day: number, value: number): RankedRun => ({
  training: { _id: id, name: id, status: 'completed', createdAt: new Date(Date.UTC(2026, 9, day)).toISOString() },
  value,
  epoch: 1
});

describe('progressOverTime', () => {
  it('orders runs by when they started and carries the best forward, whatever order the ranking came in', () => {
    const points = progressOverTime([run('c', 3, 0.7), run('a', 1, 0.5), run('b', 2, 0.4)], 'higher');
    expect(points.map((point) => point.id)).toEqual(['a', 'b', 'c']);
    expect(points.map((point) => point.bestSoFar)).toEqual([0.5, 0.5, 0.7]);
    expect(points.map((point) => point.improved)).toEqual([true, false, true]);
  });

  it('reads lower as better for a loss', () => {
    const points = progressOverTime([run('a', 1, 0.9), run('b', 2, 0.3), run('c', 3, 0.5)], 'lower');
    expect(points.map((point) => point.bestSoFar)).toEqual([0.9, 0.3, 0.3]);
  });
});

describe('barShare', () => {
  it('fills the best run and leaves a stub for the worst, in either direction', () => {
    expect(barShare(0.8, [0.8, 0.4], 'higher')).toBe(1);
    expect(barShare(0.4, [0.8, 0.4], 'higher')).toBeCloseTo(0.1);
    expect(barShare(0.1, [0.4, 0.1], 'lower')).toBe(1);
    expect(barShare(0.4, [0.4, 0.1], 'lower')).toBeCloseTo(0.1);
  });

  it('shows equal runs as equal', () => {
    expect(barShare(0.5, [0.5, 0.5], 'higher')).toBe(1);
  });
});
