import type { Benchmark, ComparisonEntry, Epoch, TestResult, Training, TrainingSummary } from '../schemas';
import { count, day, duration, metric, metricRanges, numericResults } from './module';

/**
 * How the vision tools print what they found: one run, one epoch, a test result, a benchmark, a comparison row.
 * Plain text, sized to the result ceiling in `ok`, because a tool result is re-sent with every later message.
 */

/**
 * How many metric ranges a whole comparison may spell out, across every run.
 *
 * Shared rather than fixed per run, because the constraint is the result
 * ceiling in `ok` and that is spent by all the runs together. Thirty runs times
 * a dozen metrics is four hundred lines, well past it, and the result would
 * arrive truncated mid-run rather than short.
 *
 * A fixed per-run cap was the first attempt and picked the wrong metrics: these
 * are ordered alphabetically, so capping a ten-metric run at eight dropped
 * `val.mean_iou` and `val.pixel_accuracy` — on a segmentation run, the headline
 * number and nothing else. Two runs can afford the lot; thirty cannot, and only
 * then is anything dropped.
 */
const RANGE_LINE_BUDGET = 40;

/** Never fewer than this, or the block says nothing; never more than one epoch records. */
const MIN_RANGES_PER_RUN = 3;
const MAX_RANGES_PER_RUN = 12;

export const rangesPerRun = (runs: number): number =>
  Math.min(MAX_RANGES_PER_RUN, Math.max(MIN_RANGES_PER_RUN, Math.ceil(RANGE_LINE_BUDGET / runs)));

/**
 * Tags that are not already words in the run's own name.
 *
 * Runs here are named after what distinguishes them, and then tagged with the
 * same words: "WAYMO CLFTv2-Base Fusion (window16 ablation)" carries the tags
 * WAYMO, CLFTv2, Base, Fusion and Ablation. Printing both spent about a third
 * of every row in a listing restating the row's own first half.
 *
 * Dropped only when the name already contains the tag, so a tag that genuinely
 * adds something still shows. Nothing is lost for filtering either: those words
 * are visible in the name, and `list_trainings` still takes them as `tags`.
 */
const informativeTags = (training: Training): string[] => {
  const name = training.name.toLowerCase();
  return training.tags.filter((tag) => !name.includes(tag.toLowerCase()));
};

export const describeTraining = (training: Training): string => {
  const parts = [`- ${training.name} [${training.status}]`];
  if (training.metrics?.epochCount) {
    parts.push(`${count(training.metrics.epochCount)} epochs`);
  }
  if (training.metrics?.totalTime) parts.push(duration(training.metrics.totalTime));

  const tags = informativeTags(training);
  if (tags.length > 0) parts.push(tags.join(', '));

  return `${parts.join(' · ')}  [id ${training._id}]`;
};

/** One epoch as a line: the number, then whatever it recorded. */
export const describeEpoch = (epoch: Epoch): string => {
  const values = numericResults(epoch.results)
    .map(([key, value]) => `${key} ${metric(value)}`)
    .join(', ');
  return `- epoch ${epoch.epoch}: ${values || 'no metrics recorded'}`;
};

/**
 * Where each metric got to, spelled out.
 *
 * Both ends, because this server cannot know which of them is the good one —
 * see `metricRanges`, which does the walking.
 */
export const describeRanges = (epochs: Epoch[]): string[] =>
  metricRanges(epochs).map(
    (range) =>
      `- ${range.key}: lowest ${metric(range.low)} at epoch ${range.lowEpoch}, ` +
      `highest ${metric(range.high)} at epoch ${range.highEpoch}`
  );

/**
 * Each result's best epoch beside its last, in the direction that makes it best.
 *
 * The direction is the project's own where it set one, and a guess from the result's
 * name where it did not; the line says which, because a guess is worth stating when it
 * decides which epoch is called best.
 */
export const describePeaks = (metrics: TrainingSummary['metrics']): string[] => [
  'Best epoch per result, with the direction that makes it best (the project\'s setting, or assumed from the name where it has none):',
  ...metrics.map(
    (entry) =>
      `- ${entry.path}: best ${metric(entry.best.value)} at epoch ${entry.best.epoch} ` +
      `(${entry.direction} is better${entry.directionFrom === 'taxonomy' ? '' : ', assumed'}), ` +
      `last ${metric(entry.last.value)} at epoch ${entry.last.epoch}`
  )
];

/** The five named scores, when a class records them. */
const SCORE_FIELDS: Array<[string, string]> = [
  ['iou', 'IoU'],
  ['precision', 'P'],
  ['recall', 'R'],
  ['f1_score', 'F1'],
  ['ap', 'AP']
];

/**
 * One class's line.
 *
 * Falls back to whatever numbers it does carry when none of the five named
 * scores are there — a per-condition `overall` records mIoU_foreground and
 * fw_iou instead, and printing an empty line for it would be worse than
 * printing the numbers under their own names. Arrays are skipped: a confusion
 * matrix is real data and the wrong thing to spend a tool result on.
 */
function describeClass(scores: Record<string, unknown>): string {
  const named = SCORE_FIELDS.filter(([key]) => typeof scores[key] === 'number').map(
    ([key, label]) => `${label} ${metric(scores[key] as number)}`
  );
  if (named.length > 0) return named.join('  ');

  return (
    Object.entries(scores)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .slice(0, 6)
      .map(([key, value]) => `${key} ${metric(value)}`)
      .join('  ') || 'no scores recorded'
  );
}

/**
 * A test result as a table rather than nested JSON.
 *
 * A condition is not one shape: named conditions break down by class,
 * while the top-level `overall` is a flat set of summary numbers. Both are
 * rendered, the scalars gathered onto one line so a summary does not sprawl
 * into six.
 */
export function describeTestResult(result: TestResult): string[] {
  const lines: string[] = [];
  const label = result.training?.name ? `${result.training.name}, ` : '';
  lines.push(`${label}epoch ${result.epoch ?? '?'} (${day(result.timestamp)}):`);

  for (const [condition, entries] of Object.entries(result.test_results)) {
    lines.push(`  ${condition}:`);

    const scalars: string[] = [];
    for (const [name, value] of Object.entries(entries)) {
      if (typeof value === 'number') {
        scalars.push(`${name} ${metric(value)}`);
        continue;
      }
      lines.push(`    ${name}: ${describeClass(value)}`);
    }
    if (scalars.length > 0) lines.push(`    ${scalars.join('  ')}`);
  }
  return lines;
}

/** A benchmark's headline: size, speed, memory. */
export function describeBenchmark(benchmark: Benchmark): string[] {
  const lines: string[] = [];
  const gpu = benchmark.system_info?.gpu_name;
  lines.push(
    `Benchmark ${day(benchmark.timestamp)}` +
      (benchmark.epoch !== undefined ? `, epoch ${benchmark.epoch}` : '') +
      (gpu ? ` on ${gpu}` : '') +
      ':'
  );

  for (const result of benchmark.results) {
    const name = result.model_name || result.backbone || 'model';
    const parts = [
      result.total_parameters_m !== undefined ? `${metric(result.total_parameters_m)}M params` : '',
      result.flops_giga !== undefined ? `${metric(result.flops_giga)} GFLOPs` : '',
      result.fps !== undefined ? `${metric(result.fps)} fps` : '',
      result.mean_time_ms !== undefined ? `${metric(result.mean_time_ms)} ms/frame` : '',
      result.gpu_memory_max_mb !== undefined ? `${metric(result.gpu_memory_max_mb)} MB GPU peak` : '',
      result.image_size !== undefined ? `${result.image_size}px` : ''
    ].filter(Boolean);
    lines.push(`  ${name}: ${parts.join(', ') || 'no measurements recorded'}`);
  }
  return lines;
}

/** One training's row in a comparison. */
export function describeComparisonEntry(entry: ComparisonEntry, maxRanges: number): string[] {
  const lines = [`${entry.training.name} [${entry.training.status ?? 'unknown'}]`];
  lines.push(
    `  ${count(entry.metrics.totalEpochs)} epochs over ${duration(entry.metrics.totalTime)}` +
      (entry.metrics.cost ? `, about ${metric(entry.metrics.cost.totalCost)} in compute` : '')
  );

  if (entry.lastEpoch) {
    const values = numericResults(entry.lastEpoch.results)
      .map(([key, value]) => `${key} ${metric(value)}`)
      .join(', ');
    lines.push(`  final (epoch ${entry.lastEpoch.epoch}): ${values || 'no metrics recorded'}`);
  }

  // The line that makes a comparison answerable. Without it a run is judged on
  // whatever epoch it happened to stop at, which for anything trained past its
  // best is a number nobody would report.
  const ranges = metricRanges(entry.epochs);
  if (ranges.length > 0) {
    lines.push(`  best and worst across all ${count(entry.epochs.length)} epochs:`);
    for (const range of ranges.slice(0, maxRanges)) {
      lines.push(
        `    ${range.key}: ${metric(range.low)} at epoch ${range.lowEpoch}, ` +
          `${metric(range.high)} at epoch ${range.highEpoch}`
      );
    }
    if (ranges.length > maxRanges) {
      lines.push(
        `    (${count(ranges.length - maxRanges)} further metrics not shown; ` +
          'get_training has the rest for one run.)'
      );
    }
  }

  if (entry.testResultsCount > 0) {
    lines.push(`  ${count(entry.testResultsCount)} test results — get_test_results for the breakdown`);
  }

  const benchmark = entry.benchmarks[0]?.results[0];
  if (benchmark) {
    const parts = [
      benchmark.total_parameters_m !== undefined ? `${metric(benchmark.total_parameters_m)}M params` : '',
      benchmark.fps !== undefined ? `${metric(benchmark.fps)} fps` : ''
    ].filter(Boolean);
    if (parts.length > 0) lines.push(`  ${parts.join(', ')}`);
  }

  return lines;
}
