import type { RankedRun } from '../../types/bestRun';

type Direction = 'higher' | 'lower';

export interface ProgressPoint {
  id: string;
  name: string;
  at: Date;
  value: number;
  epoch: number;
  /** the best any run up to and including this one had reached */
  bestSoFar: number;
  /** this run set a new best */
  improved: boolean;
}

/**
 * The runs in the order they were started, each with the best the project had by then: the story of a project's
 * progress. "Best" follows the direction, so for a loss it only ever goes down.
 */
export function progressOverTime(ranking: RankedRun[], direction: Direction): ProgressPoint[] {
  const better = (a: number, b: number) => (direction === 'lower' ? a < b : a > b);
  const ordered = [...ranking].sort(
    (a, b) => new Date(a.training.createdAt).getTime() - new Date(b.training.createdAt).getTime()
  );
  let best: number | null = null;
  return ordered.map((run) => {
    const improved = best === null || better(run.value, best);
    if (improved) best = run.value;
    return {
      id: run.training._id,
      name: run.training.name,
      at: new Date(run.training.createdAt),
      value: run.value,
      epoch: run.epoch,
      bestSoFar: best as number,
      improved
    };
  });
}

/**
 * How far along a bar a result should reach, from 0 to 1: the best run is full and the worst is a stub, so the
 * differences between close runs are visible without implying a score of zero.
 */
export function barShare(value: number, values: number[], direction: Direction): number {
  const high = Math.max(...values);
  const low = Math.min(...values);
  if (high === low) return 1;
  const share = (value - low) / (high - low);
  return 0.1 + 0.9 * (direction === 'lower' ? 1 - share : share);
}
