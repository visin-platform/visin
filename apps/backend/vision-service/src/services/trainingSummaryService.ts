import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import Epoch from '../models/Epoch';
import Project from '../models/Project';
import Training from '../models/Training';
import { epochMetrics } from './latexExport';
import { checkProjectAccess } from './projectAccessService';

/** A run reports a handful of metrics; past this the rest are noise a summary should not carry. */
const MAX_METRICS = 60;

/**
 * Metrics whose direction is not the usual "higher is better". The same list the
 * vision-front uses for an unconfigured metric, so the server and the UI crown the
 * same epoch: without it a loss or a latency would get its worst value as its best.
 */
const LOWER_IS_BETTER = new Set([
  'loss', 'train_loss', 'val_loss', 'error', 'error_rate', 'rmse', 'mae', 'mse', 'total_seconds',
  'mean_time_ms', 'std_time_ms', 'min_time_ms', 'max_time_ms', 'avg_per_sample_ms', 'avg_per_batch_ms',
  'latency_ms', 'gpu_memory_mean_mb', 'gpu_memory_max_mb', 'ram_memory_mean_mb', 'ram_memory_max_mb'
]);

export interface MetricSummary {
  /** where the result sits in an epoch, e.g. `val.mean_iou` */
  path: string;
  direction: 'higher' | 'lower';
  /** `taxonomy` when the project said, `default` when it is guessed from the name */
  directionFrom: 'taxonomy' | 'default';
  best: { value: number; epoch: number };
  last: { value: number; epoch: number };
}

interface TaxonomyMetric {
  key: string;
  direction?: 'higher' | 'lower';
}

/** The project's own say first, by the result's leaf name (`mean_iou` for `val.mean_iou`) or its full path. */
export function directionOf(path: string, taxonomy: TaxonomyMetric[] | undefined): Pick<MetricSummary, 'direction' | 'directionFrom'> {
  const leaf = path.split('.').pop() ?? path;
  const configured = taxonomy?.find(metric => metric.key === path)?.direction
    ?? taxonomy?.find(metric => metric.key === leaf)?.direction;
  if (configured) return { direction: configured, directionFrom: 'taxonomy' };
  return { direction: LOWER_IS_BETTER.has(leaf.toLowerCase()) ? 'lower' : 'higher', directionFrom: 'default' };
}

/**
 * One call that answers "how did this run do": its state, data, config, models and, per
 * result, the best epoch (in the direction the project says better is) beside the last.
 * A run's last epoch is not its result, so both are given. Written for the libraries, the
 * MCP server and anyone who would otherwise page through every epoch.
 */
export async function getTrainingSummary(trainingId: string, userId: string | undefined) {
  const training = await Training.findOne({ _id: trainingId, deletedAt: null }).lean();
  if (!training) throw new NotFoundError('Training not found');
  if (!(await checkProjectAccess(userId, training.projectId))) throw new ForbiddenError();

  const [epochs, project] = await Promise.all([
    Epoch.find({ trainingId: training._id.toString(), deletedAt: null }).sort({ epoch: 1 }).select('epoch results').lean(),
    training.projectId ? Project.findById(training.projectId).select('taxonomy.metrics').lean() : null
  ]);

  const series = new Map<string, { epoch: number; value: number }[]>();
  for (const epoch of epochs) {
    for (const [path, value] of epochMetrics((epoch.results ?? {}) as Record<string, unknown>)) {
      if (!series.has(path) && series.size >= MAX_METRICS) continue;
      const points = series.get(path) ?? [];
      points.push({ epoch: epoch.epoch, value });
      series.set(path, points);
    }
  }

  const metrics: MetricSummary[] = [...series]
    .map(([path, points]) => {
      const { direction, directionFrom } = directionOf(path, project?.taxonomy?.metrics as TaxonomyMetric[] | undefined);
      const better = (a: number, b: number) => (direction === 'higher' ? a > b : a < b);
      const best = points.reduce((winner, point) => (better(point.value, winner.value) ? point : winner));
      return { path, direction, directionFrom, best, last: points[points.length - 1] };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    training: {
      _id: training._id.toString(),
      uuid: training.uuid,
      name: training.name,
      status: training.status,
      projectId: training.projectId,
      datasetId: training.datasetId,
      dataset: training.dataset,
      configId: training.configId,
      tags: training.tags ?? [],
      startTime: training.startTime,
      endTime: training.endTime,
      lastSeenAt: training.lastSeenAt,
      createdAt: training.createdAt
    },
    epochCount: epochs.length,
    lastEpoch: epochs.length ? epochs[epochs.length - 1].epoch : null,
    metrics,
    models: training.models ?? [],
    ...(training.provenance ? { provenance: training.provenance } : {})
  };
}
