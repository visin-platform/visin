import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import Benchmark from '../models/Benchmark';
import Config from '../models/Config';
import Epoch from '../models/Epoch';
import Project from '../models/Project';
import Evaluation from '../models/Evaluation';
import type { IProjectTaxonomy } from '../models/taxonomy';
import Training from '../models/Training';
import type { ModelCardQuery } from '../validation/artifactSchemas';
import { headlineMetric } from './bestRunService';
import { epochMetrics } from './latexExport';
import { hubLinksOfRepo } from './huggingFace';
import { modelLinkKey, type ModelLink } from './sourceRegistry';
import { evaluationScope, readerVisible } from './evaluationScope';
import { checkProjectAccess } from './projectAccessService';
import { configuredUrl } from './publicUrls';
import { publicStandings, type PublicStanding } from './publicLeaderboardService';
import { directionOf } from './trainingSummaryService';

/** The Hub's task ids, for the project task types that name one. Anything else gets no model-index. */
const HUB_TASKS: Record<string, string> = {
  segmentation: 'image-segmentation',
  detection: 'object-detection',
  classification: 'image-classification'
};

/** A JSON string is a valid YAML double-quoted scalar, so one function quotes everything safely. */
const yaml = (value: string | number): string => JSON.stringify(value);

const cell = (value: unknown): string => String(value ?? '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const figure = (value: number): string => String(Number(value.toPrecision(4)));
const table = (head: string[], rows: unknown[][]): string =>
  [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n');

const MAX_CONDITIONS = 12;
const MAX_BENCHMARK_ROWS = 6;

interface OverallRow {
  condition: string;
  metrics: Record<string, number>;
}

/** Each condition's `overall` block: the summary a test stage reports beside its per-class rows. */
function overallRows(results: Record<string, unknown>): OverallRow[] {
  return Object.entries(results).flatMap(([condition, classes]) => {
    const overall = (classes as Record<string, unknown> | null)?.overall;
    if (!overall || typeof overall !== 'object') return [];
    const metrics = Object.fromEntries(Object.entries(overall).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)));
    return Object.keys(metrics).length ? [{ condition, metrics: metrics as Record<string, number> }] : [];
  });
}

interface PickedEpoch<T> {
  epoch: T | undefined;
  /** why this epoch, in words a reader of the card can check */
  basis: string;
}

/**
 * The epoch a card describes. One the caller named wins. Otherwise it is the epoch where the run
 * did best on the result its project ranks runs by (the same result the best-run badge uses), because a
 * run's last epoch is not its result: a card scored on it would put a worse checkpoint's numbers
 * on the model page. A run with nothing to rank on falls back to its last epoch and says so.
 */
function pickEpoch<T extends { epoch: number; results?: unknown }>(epochs: T[], taxonomy: IProjectTaxonomy | undefined, named: number | undefined): PickedEpoch<T> {
  if (named !== undefined) {
    const found = epochs.find(epoch => epoch.epoch === named);
    if (!found) throw new NotFoundError(`Epoch ${named} was not reported for this run`);
    return { epoch: found, basis: 'the epoch asked for' };
  }
  const last = epochs[epochs.length - 1];
  if (!last) return { epoch: undefined, basis: '' };

  const scored = epochs.map(epoch => ({ epoch, values: epochMetrics((epoch.results ?? {}) as Record<string, unknown>) }));
  const headline = headlineMetric([...new Set(scored.flatMap(row => [...row.values.keys()]))], taxonomy?.primaryMetric);
  const { direction } = headline ? directionOf(headline.path, taxonomy?.metrics) : { direction: 'higher' as const };
  let best: { epoch: T; value: number } | undefined;
  for (const { epoch, values } of scored) {
    const value = headline ? values.get(headline.path) : undefined;
    if (value === undefined) continue;
    if (!best || (direction === 'higher' ? value > best.value : value < best.value)) best = { epoch, value };
  }
  return best
    ? { epoch: best.epoch, basis: `best ${headline!.path}` }
    : { epoch: last, basis: 'the last epoch, as the run reports no result to pick the best by' };
}

/**
 * The README a Hub model repo should carry, written from what Visin recorded for
 * the run: where the data came from, how far it trained, what it scored, how fast
 * it runs. Front matter is the Hub's `model-index`, so the scores show on the model
 * page and the model can be found by them. It cites no config values (a config can
 * hold anything). A Visin address appears only when this deployment configures one (`SHELL_FRONT_URL`,
 * `VISION_API_URL`), in the leaderboard section, and only for results a manager published.
 */
export async function buildModelCard(trainingId: string, userId: string | undefined, query: ModelCardQuery): Promise<string> {
  const training = await Training.findOne({ _id: trainingId, deletedAt: null });
  if (!training) throw new NotFoundError('Training not found');
  if (!(await checkProjectAccess(userId, training.projectId))) throw new ForbiddenError();

  const runId = training._id.toString();
  const [epochs, project] = await Promise.all([
    Epoch.find({ trainingId: runId, deletedAt: null }).sort({ epoch: 1 }).select('epoch results epoch_time').lean(),
    training.projectId ? Project.findById(training.projectId).select('name slug taxonomy').lean() : null
  ]);
  const { epoch: chosen, basis } = pickEpoch(epochs, project?.taxonomy, query.epoch);
  // What the run's checkpoint scored at that epoch: everything for someone in the project, and only what a project shows
  // for someone who can merely read it, so a card never tells a reader what the evaluations page would not.
  const member = training.projectId ? (await evaluationScope(userId)).full.includes(training.projectId) : false;

  const [config, tests, benchmark] = await Promise.all([
    training.configId ? Config.findById(training.configId).select('summary').lean() : null,
    chosen
      ? Evaluation.find({
          'source.trainingId': runId,
          'source.epoch': chosen.epoch,
          deletedAt: null,
          status: 'completed',
          supersededById: { $exists: false },
          ...(member ? {} : readerVisible)
        })
          .sort({ executedAt: -1, receivedAt: -1 })
          .limit(1)
          .select('results')
          .lean()
      : [],
    Benchmark.findOne({ training_id: training._id, deletedAt: null, ...(chosen ? { $or: [{ epoch: chosen.epoch }, { epoch: { $exists: false } }] } : {}) }).sort({ timestamp: -1 }).lean()
  ]);

  const metrics = chosen ? [...epochMetrics((chosen.results ?? {}) as Record<string, unknown>)] : [];
  const task = HUB_TASKS[project?.taxonomy?.taskType ?? ''];
  const dataset = training.dataset;
  const title = query.repo?.split('/')[1] ?? training.name;

  const front = ['---', 'library_name: visin-trained', 'tags:', '  - visin', ...(task ? [`  - ${task}`] : [])];
  if (task && metrics.length) {
    front.push(
      'model-index:',
      `  - name: ${yaml(title)}`,
      '    results:',
      '      - task:',
      `          type: ${yaml(task)}`,
      '        dataset:',
      `          name: ${yaml(dataset?.name ?? training.datasetId ?? 'training data')}`,
      `          type: ${yaml(dataset?.name ?? training.datasetId ?? 'unknown')}`,
      '        metrics:',
      ...metrics.flatMap(([name, value]) => [`          - type: ${yaml(name)}`, `            value: ${value}`, `            name: ${yaml(name)}`])
    );
  }
  front.push('---');

  const facts: unknown[][] = [
    ['Run', training.name],
    ...(project ? [['Project', project.name]] : []),
    ['Dataset', dataset ? `${dataset.name}${dataset.revision ? ` @ ${dataset.revision.slice(0, 40)}` : ''}` : training.datasetId ?? 'not recorded'],
    ['Epochs reported', epochs.length],
    ...(chosen ? [['This checkpoint', `epoch ${chosen.epoch} (${basis})`]] : []),
    ...(config?.summary ? [['Configuration', config.summary]] : []),
    ['Run id', training.uuid]
  ];

  const body = [
    `# ${title}`,
    '',
    `${training.description ? `${training.description}\n\n` : ''}Trained and tracked with [Visin](https://github.com/visin-platform/visin).`,
    '',
    '## Training',
    '',
    table(['', ''], facts)
  ];
  if (metrics.length) {
    body.push('', `## Results at epoch ${chosen!.epoch}`, '', table(['Metric', 'Value'], metrics.map(([name, value]) => [name, figure(value)])));
  }
  const overall = tests[0] ? overallRows((tests[0].results ?? {}) as Record<string, unknown>).slice(0, MAX_CONDITIONS) : [];
  if (overall.length) {
    const names = [...new Set(overall.flatMap(row => Object.keys(row.metrics)))].sort();
    body.push('', '## Test results', '', table(['Condition', ...names], overall.map(row => [row.condition, ...names.map(name => (row.metrics[name] === undefined ? '-' : figure(row.metrics[name])))])));
  }
  const speeds = (benchmark?.results ?? []).slice(0, MAX_BENCHMARK_ROWS);
  if (speeds.length) {
    body.push('', '## Speed', '', table(['Device', 'FPS', 'Mean time (ms)', 'Parameters (M)'], speeds.map(result => [
      result.device ?? result.device_type,
      typeof result.fps === 'number' ? figure(result.fps) : '-',
      typeof result.mean_time_ms === 'number' ? figure(result.mean_time_ms) : '-',
      typeof result.total_parameters_m === 'number' ? figure(result.total_parameters_m) : typeof result.total_parameters === 'number' ? figure(result.total_parameters / 1e6) : '-'
    ])));
  }

  const standings = training.projectId ? await standingsOf(training.models ?? [], query.repo, training.projectId) : [];
  if (standings.length) body.push('', '## Leaderboards', '', leaderboardTable(standings, project?.slug));

  return `${front.join('\n')}\n\n${body.join('\n')}\n`;
}

/** The public leaderboards the Hub repo's linked checkpoints are published to; none for a repo no link names. */
async function standingsOf(models: ModelLink[], repo: string | undefined, projectId: string): Promise<Array<PublicStanding & { key: string }>> {
  if (!repo) return [];
  const keys = [...new Set(hubLinksOfRepo(models, repo).map(modelLinkKey))];
  const found = await Promise.all(keys.map(async key => (await publicStandings(key, projectId)).map(standing => ({ ...standing, key }))));
  return found.flat();
}

/**
 * The published standings as a table. Links and badges are written only from this deployment's own configured
 * addresses (and a badge only for a project that has a slug); with none configured the table still says suite, rank and
 * score.
 */
function leaderboardTable(standings: Array<PublicStanding & { key: string }>, projectSlug: string | undefined): string {
  const app = configuredUrl('SHELL_FRONT_URL');
  const api = configuredUrl('VISION_API_URL');
  return table(
    ['Suite', 'Rank', 'Score', ''],
    standings.map(standing => {
      const name = `${standing.suite.slug}@${standing.suite.version}`;
      const page = app ? `${app}/leaderboards/${standing.suite.slug}/${standing.suite.version}/${standing.evaluationId}` : undefined;
      // A badge names the project as well as the checkpoint: two projects can each publish the same Hub model.
      const badge = api && projectSlug ? `${api}/api/public/badges/${standing.suite.slug}/${standing.suite.version}/${encodeURIComponent(standing.key)}.svg?project=${encodeURIComponent(projectSlug)}` : undefined;
      const link = page ? `[${name}](${page})` : name;
      return [link, `${standing.rank} of ${standing.total}`, `${standing.headline.key} ${figure(standing.headline.value)}`, badge ? `[![${name}](${badge})](${page ?? badge})` : ''];
    })
  );
}
