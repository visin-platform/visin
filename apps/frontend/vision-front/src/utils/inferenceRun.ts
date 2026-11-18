import type { Epoch } from '../types/epoch';
import type { Training } from '../types/training';

/**
 * An inference run is a model's pass over a fixed set of frames. Its progress points are stored as epochs whose
 * number is the frames done, so everything here reads "epoch" as "frames done" and never says "epoch" to a reader.
 */
export const isInferenceRun = (training: Pick<Training, 'kind'> | undefined): boolean => training?.kind === 'inference';

const UNIT_NOUN = { frame: 'frames' } as const;

/** "1,234 / 4,110 frames", or null for a run that reports no progress. */
export function progressText(training: Pick<Training, 'progress'>): string | null {
  const progress = training.progress;
  if (!progress) return null;
  return `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} ${UNIT_NOUN[progress.unit]}`;
}

/** Done as a share of total, 0–100. */
export function progressPercent(training: Pick<Training, 'progress'>): number | null {
  const progress = training.progress;
  if (!progress || progress.total <= 0) return null;
  return Math.min(100, (progress.done / progress.total) * 100);
}

export interface Pace {
  /** frames per hour over the measured span */
  perHour: number;
  /** milliseconds until the last frame at that pace; 0 when done */
  remainingMs: number;
}

/**
 * The pace of a run from its own progress points: the first and last points that report frames, by their
 * timestamps. A resumed run's first point already counts the frames recovered from disk, so measuring from it
 * (and not from zero at the run's creation) keeps those frames from inflating the pace. Null with fewer than two
 * points, or when no time passed between them: a guess is worse than no ETA.
 */
export function inferencePace(training: Pick<Training, 'progress'>, epochs: Pick<Epoch, 'epoch' | 'timestamp'>[]): Pace | null {
  const progress = training.progress;
  if (!progress) return null;
  const points = epochs
    .map((epoch) => ({ done: epoch.epoch, at: new Date(epoch.timestamp).getTime() }))
    .filter((point) => Number.isFinite(point.done) && Number.isFinite(point.at))
    .sort((a, b) => a.at - b.at);
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const frames = last.done - first.done;
  const elapsed = last.at - first.at;
  if (frames <= 0 || elapsed <= 0) return null;
  const perMs = frames / elapsed;
  return { perHour: perMs * 3_600_000, remainingMs: Math.max(0, progress.total - progress.done) / perMs };
}

/** "3 h 20 min", "45 min", "under a minute". */
export function formatRemaining(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export type ProgressUnit = 'rate' | 'ms' | 'value';

export interface ProgressSeries {
  /** the path in the point's results, `reject_rate` or `reject_rate.<class>` */
  id: string;
  label: string;
  unit: ProgressUnit;
  /** one value per point, in the order of `frames`; null where a point did not report it */
  data: (number | null)[];
}

const unitOf = (key: string): ProgressUnit => (key.endsWith('_rate') ? 'rate' : key.endsWith('_ms') ? 'ms' : 'value');
/** `reject_rate` → "Reject rate", `latency_ms` → "Latency": the unit is the axis's to say. */
const labelOf = (key: string) => key.replace(/_ms$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * The running metrics an inference run reports with its progress, one series per number. A number at the top of
 * a point's results is a series of its own; a group of numbers under one key (`reject_rate: { <class>: … }`) is one
 * series per member, in the group's unit. The unit is read from the key's suffix, so one chart never mixes units:
 * `_rate` is a share 0–1, `_ms` a duration; anything else is a plain value.
 */
export function progressSeries(epochs: Pick<Epoch, 'epoch' | 'results'>[]): { frames: number[]; series: ProgressSeries[] } {
  const points = [...epochs].sort((a, b) => a.epoch - b.epoch);
  const order: string[] = [];
  const meta = new Map<string, { label: string; unit: ProgressUnit }>();
  const values = points.map((point) => {
    const flat = new Map<string, number>();
    for (const [key, value] of Object.entries(point.results ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        flat.set(key, value);
        if (!meta.has(key)) meta.set(key, { label: labelOf(key), unit: unitOf(key) });
      } else if (value && typeof value === 'object' && !Array.isArray(value) && key !== 'system_info') {
        for (const [member, inner] of Object.entries(value as Record<string, unknown>)) {
          if (typeof inner !== 'number' || !Number.isFinite(inner)) continue;
          const id = `${key}.${member}`;
          flat.set(id, inner);
          if (!meta.has(id)) meta.set(id, { label: `${labelOf(key)} · ${member}`, unit: unitOf(key) });
        }
      }
    }
    for (const id of flat.keys()) if (!order.includes(id)) order.push(id);
    return flat;
  });
  return {
    frames: points.map((point) => point.epoch),
    series: order.map((id) => ({ id, ...meta.get(id)!, data: values.map((flat) => flat.get(id) ?? null) }))
  };
}
