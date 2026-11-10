import { describe, expect, it } from 'vitest';
import { bestEpoch, formatReading } from './bestEpoch';

describe('bestEpoch', () => {
  it('takes the highest reading for a score and the lowest for a loss, the first time it was reached', () => {
    expect(bestEpoch([1, 2, 3, 4], [0.5, 0.8, 0.8, 0.79], 'higher')).toMatchObject({
      epoch: 2,
      value: 0.8,
      lastEpoch: 4
    });
    expect(bestEpoch([1, 2, 3], [0.9, 0.3, 0.4], 'lower')).toMatchObject({ epoch: 2, value: 0.3, last: 0.4 });
  });

  it('skips epochs that did not report, rather than reading them as zero', () => {
    expect(bestEpoch([1, 2, 3], [0.6, null, 0.7], 'lower')).toMatchObject({ epoch: 1, lastEpoch: 3 });
    expect(bestEpoch([1, 2], [0.6, null], 'higher')).toBeNull();
  });

  it('calls a run drifted only when it ended well away from its best', () => {
    // range 0.4, last 0.02 from the best: within a tenth of the range
    expect(bestEpoch([1, 2, 3], [0.4, 0.8, 0.78], 'higher')?.drifted).toBe(false);
    // last 0.3 from the best
    expect(bestEpoch([1, 2, 3], [0.4, 0.8, 0.5], 'higher')?.drifted).toBe(true);
    // ending on the best is never drifted, and a flat line has nothing to drift from
    expect(bestEpoch([1, 2], [0.4, 0.8], 'higher')?.drifted).toBe(false);
    expect(bestEpoch([1, 2], [0.5, 0.5], 'higher')?.drifted).toBe(false);
  });

  it('formats a reading to a few significant digits', () => {
    expect(formatReading(0.812345)).toMatch(/^0[.,]8123$/);
  });
});
