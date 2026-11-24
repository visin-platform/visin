/**
 * How long a stopping worker lets running turns finish before it aborts them: a turn ends on its own after 260
 * seconds (worker.ts), so this lets every one of them, and stays under the 5 minute lease. A container's stop grace
 * period must be longer (compose: 285s).
 */
const PRODUCTION_DRAIN_MS = 265_000;
/** A developer restarting the process is waiting at a terminal. */
const DEVELOPMENT_DRAIN_MS = 5_000;

/** `WORKER_DRAIN_MS` when it is a number (0 included), otherwise the default for where this runs. */
export function drainMs(env: NodeJS.ProcessEnv = process.env): number {
  const set = Number(env.WORKER_DRAIN_MS);
  if (Number.isFinite(set) && set >= 0 && env.WORKER_DRAIN_MS?.trim()) return set;
  return env.NODE_ENV === 'production' ? PRODUCTION_DRAIN_MS : DEVELOPMENT_DRAIN_MS;
}
