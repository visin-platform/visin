import Evaluation from '../models/Evaluation';
import Training from '../models/Training';
import { evaluationScope } from './evaluationScope';

/**
 * What a run scored, summarised for comparing runs.
 *
 * A result is an open blob (condition → class → metrics, with `overall` and `inference_time` pseudo-keys), and the
 * field's real shape is dynamic, so it is typed here against just what is read rather than against any declared shape.
 */
export type ResultBlob = Record<string, Record<string, unknown>>;

export interface MetricStat {
  mean: number;
  std: number;
}
// Depth below the condition/class level is genuinely dynamic (a "car"/"truck"/"overall"
// key maps to a metric-name→MetricStat dict, while the "inference_time" pseudo-condition
// maps straight to one) — callers narrow the specific sub-shape they expect.
export type AggregatedResults = Record<string, Record<string, unknown>>;

const meanAndSpread = (values: number[]): MetricStat => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { mean, std: Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length) };
};

/** Mean and spread of every class metric and overall figure across results, per condition; null for no results. */
export function aggregateResults(blobs: ResultBlob[]): AggregatedResults | null {
  if (blobs.length === 0) return null;

  const conditions = Object.keys(blobs[0]).filter(condition => condition !== 'inference_time');
  const classes = new Set<string>();

  // Collect all classes across all results
  blobs.forEach(blob => {
    Object.values(blob).forEach(conditionData => {
      if (conditionData && typeof conditionData === 'object') {
        Object.keys(conditionData).forEach(className => {
          if (className !== 'inference_time' && !className.startsWith('mean_')) classes.add(className);
        });
      }
    });
  });

  const classArray = Array.from(classes).sort();
  const aggregated: AggregatedResults = {};

  conditions.forEach(condition => {
    aggregated[condition] = {};

    classArray.forEach(className => {
      const classMetrics: Record<string, MetricStat> = {};
      for (const metric of ['iou', 'recall', 'precision', 'f1_score', 'ap']) {
        const values: number[] = [];
        blobs.forEach(blob => {
          const classData = blob[condition]?.[className];
          if (classData && typeof classData === 'object') {
            const value = (classData as Record<string, unknown>)[metric];
            if (typeof value === 'number' && !isNaN(value)) values.push(value);
          }
        });
        if (values.length > 0) classMetrics[metric] = meanAndSpread(values);
      }
      if (Object.keys(classMetrics).length > 0) aggregated[condition][className] = classMetrics;
    });

    // Aggregate overall metrics
    const overallData: Record<string, MetricStat> = {};
    for (const metric of ['mIoU_foreground', 'mean_accuracy', 'fw_iou', 'pixel_accuracy']) {
      const values: number[] = [];
      blobs.forEach(blob => {
        const overall = blob[condition]?.overall;
        if (overall && typeof overall === 'object') {
          const value = (overall as Record<string, unknown>)[metric];
          if (typeof value === 'number' && !isNaN(value)) values.push(value);
        }
      });
      if (values.length > 0) overallData[metric] = meanAndSpread(values);
    }
    if (Object.keys(overallData).length > 0) aggregated[condition].overall = overallData;
  });

  // Aggregate inference time
  const inferenceTimes: number[] = [];
  blobs.forEach(blob => {
    Object.values(blob).forEach(conditionData => {
      const inferenceTime = conditionData?.inference_time as { avg_per_sample_ms?: number } | undefined;
      if (inferenceTime?.avg_per_sample_ms) inferenceTimes.push(inferenceTime.avg_per_sample_ms);
    });
  });
  if (inferenceTimes.length > 0) aggregated.inference_time = { avg_per_sample_ms: meanAndSpread(inferenceTimes) };

  return aggregated;
}

export interface RunResultSummary {
  training: { _id: string; name: string; uuid: string; status: string };
  /** the latest result the run reported, summarised; null when it reported none */
  aggregatedResults: AggregatedResults | null;
  testResultsCount: number;
}

/**
 * For each run the caller may see, its latest result summarised and how many it has. Only the latest is summarised, so
 * an older attempt is not averaged into a newer one. A run in a project the caller can only read shows only what was
 * shown there (its tests, and what was published), like the evaluations page.
 */
export async function latestResultsByRun(userId: string | undefined, trainingIds: string[]): Promise<{ comparison: RunResultSummary[] }> {
  const trainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });
  const scope = await evaluationScope(userId);
  const full = new Set(scope.full);
  const readable = new Set([...scope.full, ...scope.published]);
  const visible = trainings.filter(training => training.projectId && readable.has(training.projectId));
  const byId = new Map(visible.map(training => [training._id.toString(), training]));

  const rows = await Evaluation.find({
    'source.trainingId': { $in: [...byId.keys()] },
    deletedAt: null,
    status: 'completed',
    supersededById: { $exists: false }
  })
    .select('source.trainingId projectId results executedAt receivedAt publishedAt suite')
    .lean();

  const comparison = trainingIds.flatMap((trainingId): RunResultSummary[] => {
    const training = byId.get(trainingId);
    if (!training) return [];
    const mine = rows.filter(row => row.source?.trainingId === trainingId && (full.has(row.projectId) || row.publishedAt || !row.suite));
    const when = (row: (typeof rows)[number]) => new Date(row.executedAt ?? row.receivedAt).getTime();
    const latest = mine.reduce<(typeof rows)[number] | undefined>((held, next) => (!held || when(next) > when(held) ? next : held), undefined);
    return [
      {
        training: { _id: training._id.toString(), name: training.name, uuid: training.uuid, status: training.status },
        aggregatedResults: latest ? aggregateResults([latest.results as ResultBlob]) : null,
        testResultsCount: mine.length
      }
    ];
  });
  return { comparison };
}
