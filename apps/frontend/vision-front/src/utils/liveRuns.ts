import type { Training } from '../types/training';

/** How often a page that shows a run in progress asks for it again. */
export const LIVE_POLL_MS = 4000;

/** Whether any of these runs is still training: the pages showing it keep asking while it is, and stop when it is not. */
export const anyRunning = (trainings: Pick<Training, 'status'>[] | undefined): boolean =>
  Boolean(trainings?.some((training) => training.status === 'running'));

/** `refetchInterval` for a query that returns runs: poll while one is running, never otherwise. */
export const pollWhileRunning =
  <T,>(pick: (data: T | undefined) => Pick<Training, 'status'>[] | undefined) =>
  (query: { state: { data: T | undefined } }): number | false =>
    anyRunning(pick(query.state.data)) ? LIVE_POLL_MS : false;

/** Seconds an epoch takes on average, or null before one has finished. */
export const secondsPerEpoch = (training: Pick<Training, 'metrics'>): number | null => {
  const metrics = training.metrics;
  return metrics && metrics.epochCount > 0 && metrics.totalTime > 0 ? metrics.totalTime / metrics.epochCount : null;
};
