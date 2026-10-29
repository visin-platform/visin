import { describe, expect, it } from 'vitest';
import { pickHeadlineMetrics } from './headlineMetrics';

const lowerIs = (...lower: string[]) => (key: string) => lower.includes(key);

describe('pickHeadlineMetrics', () => {
  it('takes the first metric of each direction', () => {
    expect(pickHeadlineMetrics(['accuracy', 'loss', 'top5', 'val_loss'], lowerIs('loss', 'val_loss'))).toEqual([
      'loss',
      'accuracy'
    ]);
  });

  it('falls back to the first metrics when the run has only one kind', () => {
    expect(pickHeadlineMetrics(['top1', 'top5', 'f1'], lowerIs())).toEqual(['top1', 'top5']);
    expect(pickHeadlineMetrics(['loss', 'rmse'], lowerIs('loss', 'rmse'))).toEqual(['loss', 'rmse']);
  });

  it('returns what there is for a run with fewer metrics, or none', () => {
    expect(pickHeadlineMetrics(['loss'], lowerIs('loss'))).toEqual(['loss']);
    expect(pickHeadlineMetrics([], lowerIs())).toEqual([]);
  });
});
