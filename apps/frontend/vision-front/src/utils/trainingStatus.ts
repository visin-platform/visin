import type { Training } from '../types/training';

type RunState = Pick<Training, 'status' | 'lastSeenAt'>;

/** How long ago a stalled run was last heard from ("5 min", "2 h"), or null when it never was or is not stalled. */
export function lastHeardAgo(training: RunState, now = Date.now()): string | null {
  if (training.status !== 'stalled' || !training.lastSeenAt) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(training.lastSeenAt).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`;
}

export function trainingStatusLabel(training: RunState, now = Date.now()): string {
  const heard = lastHeardAgo(training, now);
  return heard ? `stalled — last heard ${heard} ago` : training.status;
}

/** The parts of a run that are reported separately, each by its own stage of the pipeline. */
export type RunPart = 'epochs' | 'tests' | 'benchmarks' | 'visualizations';

const PARTS: Record<RunPart, { noun: string; stage: string; afterTraining: boolean }> = {
  epochs: { noun: 'epochs', stage: 'training', afterTraining: false },
  tests: { noun: 'test results', stage: 'the test stage', afterTraining: true },
  benchmarks: { noun: 'benchmarks', stage: 'the benchmark stage', afterTraining: true },
  visualizations: { noun: 'visualizations', stage: 'the visualize stage', afterTraining: true }
};

/**
 * What an empty tab should say, in words: not just that there is nothing, but why, given
 * where the run is. A run that is still training has no test results *yet*; one that
 * finished without any needs a different sentence, because something did not happen.
 */
export function describeEmpty(part: RunPart, run?: RunState, now = Date.now()): { title: string; body: string } {
  const { noun, stage, afterTraining } = PARTS[part];
  const Stage = stage.charAt(0).toUpperCase() + stage.slice(1);
  const waiting = { title: `No ${noun} yet` };
  const settled = { title: `No ${noun}` };

  switch (run?.status) {
    case 'pending':
      return { ...waiting, body: `This run has not started. The ${noun} are reported by ${stage}.` };
    case 'running':
      return {
        ...waiting,
        body: afterTraining
          ? `This run is still training. ${Stage} usually comes after it.`
          : 'This run is training. The first epoch appears here when it finishes one.'
      };
    case 'stalled': {
      const heard = lastHeardAgo(run, now);
      return {
        ...waiting,
        body: `This run has stopped reporting${heard ? ` (last heard ${heard} ago)` : ''}, so ${noun} may never arrive. It may have crashed or lost its connection.`
      };
    }
    case 'failed':
      return {
        ...settled,
        body: afterTraining ? `This run failed before it got to ${stage}.` : 'This run failed before it finished an epoch.'
      };
    case 'completed':
      return {
        ...settled,
        body: `This run finished without reporting any. ${Stage} may have been skipped, or its results were never sent to Visin.`
      };
    default:
      return { ...waiting, body: `The ${noun} are reported by ${stage}.` };
  }
}
