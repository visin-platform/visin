import type { MetricDirection } from '../../types/taxonomy';

export interface BestEpoch {
  /** The epoch at which the metric was best, the first one if it was reached more than once. */
  epoch: number;
  value: number;
  /** Where the series ended, for "best at 63, ended at …". */
  lastEpoch: number;
  last: number;
  /**
   * The run kept going well past its best: the last reading is more than a tenth of the series' range away from it.
   * Training past the best checkpoint is ordinary; ending far from it is worth seeing.
   */
  drifted: boolean;
}

/** How far from the best the last reading has to be, as a share of the series' range, to count as drifted. */
const DRIFT_SHARE = 0.1;

/**
 * The best epoch of one series, in the metric's direction (for a loss, the lowest). Epochs that did not report the
 * metric are skipped, not read as zero. Needs two readings: one point has no best to speak of.
 */
export function bestEpoch(epochs: number[], values: (number | null)[], direction: MetricDirection): BestEpoch | null {
  const points = epochs.flatMap((epoch, index) => {
    const value = values[index];
    return typeof value === 'number' && Number.isFinite(value) ? [{ epoch, value }] : [];
  });
  if (points.length < 2) return null;
  const better = (a: number, b: number) => (direction === 'lower' ? a < b : a > b);
  const best = points.reduce((winner, point) => (better(point.value, winner.value) ? point : winner));
  const last = points[points.length - 1];
  const readings = points.map((point) => point.value);
  const range = Math.max(...readings) - Math.min(...readings);
  return {
    epoch: best.epoch,
    value: best.value,
    lastEpoch: last.epoch,
    last: last.value,
    drifted: range > 0 && last.epoch !== best.epoch && Math.abs(last.value - best.value) > range * DRIFT_SHARE
  };
}

const formatter = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 });

/** A metric reading as the chart labels it: a few significant digits, which is all a glance needs. */
export const formatReading = (value: number) => formatter.format(value);
