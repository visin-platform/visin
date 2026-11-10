import { describe, expect, it } from 'vitest';
import { LIVE_POLL_MS, anyRunning, pollWhileRunning, secondsPerEpoch } from './liveRuns';

describe('anyRunning', () => {
  it('is true while any run is training, and false for none, or for nothing yet', () => {
    expect(anyRunning([{ status: 'completed' }, { status: 'running' }])).toBe(true);
    expect(anyRunning([{ status: 'completed' }, { status: 'failed' }, { status: 'stalled' }, { status: 'pending' }])).toBe(false);
    expect(anyRunning([])).toBe(false);
    expect(anyRunning(undefined)).toBe(false);
  });
});

describe('pollWhileRunning', () => {
  const poll = pollWhileRunning((data: { runs: { status: 'running' | 'completed' }[] } | undefined) => data?.runs);

  it('asks again while a run is training, and stops once none is', () => {
    expect(poll({ state: { data: { runs: [{ status: 'running' }] } } })).toBe(LIVE_POLL_MS);
    expect(poll({ state: { data: { runs: [{ status: 'completed' }] } } })).toBe(false);
    expect(poll({ state: { data: undefined } })).toBe(false);
  });
});

describe('secondsPerEpoch', () => {
  const run = (epochCount: number, totalTime: number) => ({
    metrics: { totalTime, epochCount, maxEpoch: epochCount, lastEpochTimestamp: null, cpuCost: 0, gpuCost: 0, totalCost: 0 }
  });
  it('is the average, and unknown before an epoch has finished or time has been recorded', () => {
    expect(secondsPerEpoch(run(10, 340))).toBe(34);
    expect(secondsPerEpoch(run(0, 0))).toBeNull();
    expect(secondsPerEpoch(run(3, 0))).toBeNull();
    expect(secondsPerEpoch({})).toBeNull();
  });
});
