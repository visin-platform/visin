import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vision } from '../vision';
import type { Benchmark, ComparisonEntry, Epoch, TestResult, Training } from '../schemas';
import {
  Caller,
  ToolModule,
  resolveTrainingUuid,
  capped,
  count,
  day,
  duration,
  describeCurve,
  explain,
  flattenConfig,
  metric,
  metricRanges,
  numericResults,
  ok,
  sample
} from './module';

/**
 * Runs, and what came out of them.
 *
 * Eight tools over roughly forty routes, shaped by the questions people ask
 * rather than by the endpoints that answer them. One tool per route would bury
 * the handful anyone wants under thirty they do not, and each one the model has
 * to read costs context before it has answered anything.
 */

/** How many epochs a curve is sampled down to. */
const CURVE_POINTS = 12;

/**
 * How many config settings one run prints.
 *
 * A full pipeline config runs to hundreds of keys — paths, seeds, logging
 * flags — and a tool result is re-sent with every later message. Enough to see
 * what a run was set to, not enough to crowd out the answer it was asked for.
 */
const MAX_CONFIG_KEYS = 40;

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

const rangesPerRun = (runs: number): number =>
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

const describeTraining = (training: Training): string => {
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
const describeEpoch = (epoch: Epoch): string => {
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
const describeRanges = (epochs: Epoch[]): string[] =>
  metricRanges(epochs).map(
    (range) =>
      `- ${range.key}: lowest ${metric(range.low)} at epoch ${range.lowEpoch}, ` +
      `highest ${metric(range.high)} at epoch ${range.highEpoch}`
  );

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
 * A condition is not one shape: the weather conditions break down by class,
 * while the top-level `overall` is a flat set of summary numbers. Both are
 * rendered, the scalars gathered onto one line so a summary does not sprawl
 * into six.
 */
function describeTestResult(result: TestResult): string[] {
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
function describeBenchmark(benchmark: Benchmark): string[] {
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
function describeComparisonEntry(entry: ComparisonEntry, maxRanges: number): string[] {
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

function registerReadTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'list_projects',
    {
      title: 'Projects',
      description:
        'Every project the caller can see — their own, plus public ones. Start here when the ' +
        'user names a project, to turn that name into the slug or id the other tools take.',
      inputSchema: {
        search: z.string().optional().describe('Free-text filter over name and description')
      }
    },
    async ({ search }) => {
      try {
        const projects = await vision.listProjects(key, search);
        if (projects.length === 0) {
          return ok(
            search
              ? `No project matches "${search}".`
              : 'No projects are visible to this key. A private project is invisible to anyone but its owner.'
          );
        }

        const { shown, note } = capped(projects, 50, 'projects');
        const lines = shown.map((project) => {
          const visibility = project.isPublic ? 'public' : 'private';
          const description = project.description ? ` — ${project.description}` : '';
          return `- ${project.name} (${visibility})${description}  [${project.slug ?? project._id}]`;
        });
        return ok([`${count(projects.length)} projects:`, ...lines].join('\n') + note);
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_project',
    {
      title: 'One project and how much work is in it',
      description:
        'A project with its totals: how many training runs and epochs, how long they took, ' +
        'roughly what the compute cost, and how many test results, benchmarks and ' +
        'visualizations hang off it. Use for "how is project X doing" or "what is in X".',
      inputSchema: {
        project: z.string().describe('The project slug or id, from list_projects')
      }
    },
    async ({ project }) => {
      try {
        // Two calls because they are two endpoints; the model asked one question.
        const [details, stats] = await Promise.all([
          vision.getProject(key, project),
          vision.getDashboardStats(key, project)
        ]);

        const lines = [
          `${details.name} (${details.isPublic ? 'public' : 'private'})`,
          details.description ?? '',
          '',
          `${count(stats.trainingStats.totalTrainings)} training runs, ` +
            `${count(stats.trainingStats.totalEpochs)} epochs, ` +
            `${duration(stats.trainingStats.totalTime)} of compute.`
        ];

        if (stats.trainingStats.avgEpochTime > 0) {
          lines.push(`Average epoch: ${duration(stats.trainingStats.avgEpochTime)}.`);
        }
        if (stats.trainingStats.totalCost > 0) {
          lines.push(
            `Estimated compute cost ${metric(stats.trainingStats.totalCost)} ` +
              `(${metric(stats.trainingStats.totalGpuCost)} GPU, ${metric(stats.trainingStats.totalCpuCost)} CPU).`
          );
        }
        lines.push(
          `${count(stats.testResultsCount)} test results, ` +
            `${count(stats.benchmarksCount)} benchmarks, ` +
            `${count(stats.visualizationsCount)} visualizations.`
        );

        return ok(lines.filter((line) => line !== '').join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'list_trainings',
    {
      title: 'Training runs',
      description:
        'Training runs, newest first, with their status and size. Filter by project, status or ' +
        'tag. Use to find the run the user means before asking anything about it.',
      inputSchema: {
        project: z.string().optional().describe('Project slug or id, from list_projects'),
        status: z
          .enum(['pending', 'running', 'completed', 'failed'])
          .optional()
          .describe('Only runs in this state'),
        search: z.string().optional().describe('Free-text filter over name and description'),
        tags: z.string().optional().describe('Comma-separated tags; a run must carry all of them'),
        limit: z.number().int().min(1).max(100).optional().describe('How many to return (default 30)')
      }
    },
    async ({ project, status, search, tags, limit }) => {
      try {
        const { trainings, pagination } = await vision.listTrainings(key, {
          projectId: project,
          status,
          search,
          tags,
          limit: limit ?? 30
        });

        if (trainings.length === 0) return ok('No training runs match that.');

        const total = pagination?.total ?? trainings.length;
        const header =
          total > trainings.length
            ? `${count(trainings.length)} of ${count(total)} runs:`
            : `${count(trainings.length)} runs:`;
        return ok([header, ...trainings.map(describeTraining)].join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_training',
    {
      title: 'One training run',
      description:
        'One run: status, duration, the hyperparameters it was launched with, its final epoch, ' +
        'and where every metric peaked. Answers "how did X go" and "what was it set to". For the ' +
        'shape of the curve rather than its ends, use get_training_curve.',
      inputSchema: { training: z.string().describe('The training id, from list_trainings') }
    },
    async ({ training }) => {
      try {
        // Configs are fetched alongside, and a failure there must not take the
        // run's metrics with it: the settings are context for the numbers, not
        // the answer. A run whose config was deleted still has results worth
        // reading.
        const [{ training: details, epochs }, configs] = await Promise.all([
          vision.getTrainingWithEpochs(key, training),
          vision.getTrainingConfigs(key, training).catch(() => [])
        ]);

        const lines = [
          `${details.name} [${details.status}]`,
          details.description ?? '',
          ''
        ];

        const started = details.startTime ?? details.createdAt;
        if (started) lines.push(`Started ${day(started)}${details.endTime ? `, ended ${day(details.endTime)}` : ''}.`);
        if (details.tags.length > 0) lines.push(`Tags: ${details.tags.join(', ')}.`);
        if (details.datasetId) lines.push(`Dataset: ${details.datasetId}.`);

        // Before the early return below, not after: a run that has not started
        // yet is exactly when "what is this set to" is the question being
        // asked, and it is the one run with no epochs to describe instead.
        // A config routinely repeats what the run record already says — a
        // `Summary` holding the run's own name, a `tags` array holding its own
        // tags. Filtered by value rather than by key name, so it keeps working
        // whatever a given pipeline chose to call them.
        const alreadySaid = new Set([details.name, JSON.stringify(details.tags)]);
        const settings = configs
          .flatMap((config) => flattenConfig(config.config_data))
          .filter(([, value]) => !alreadySaid.has(value));
        if (settings.length > 0) {
          const shown = settings.slice(0, MAX_CONFIG_KEYS);
          lines.push(
            '',
            `Configuration${configs[0]?.config_name ? ` (${configs[0].config_name})` : ''}:`,
            ...shown.map(([path, value]) => `  ${path} = ${value}`)
          );
          if (settings.length > shown.length) {
            lines.push(`  (${count(settings.length - shown.length)} further settings not shown)`);
          }
        }

        if (epochs.length === 0) {
          lines.push('', 'No epochs recorded yet.');
          return ok(lines.filter((line) => line !== '').join('\n'));
        }

        const totalTime = epochs.reduce((sum, epoch) => sum + (epoch.epoch_time ?? 0), 0);
        lines.push(
          '',
          `${count(epochs.length)} epochs over ${duration(totalTime)} ` +
            `(about ${duration(totalTime / epochs.length)} each).`
        );

        const last = epochs[epochs.length - 1];
        lines.push('', 'Final epoch:', describeEpoch(last));

        const best = describeRanges(epochs);
        if (best.length > 0) {
          lines.push(
            '',
            'Across every epoch — this server does not know which direction is better for a',
            'given metric, so both ends are given:',
            ...best
          );
        }

        return ok(lines.filter((line) => line !== '').join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_training_curve',
    {
      title: 'How a run progressed',
      description:
        'A run\'s metrics over time, one line per metric, sampled to about a dozen epochs plus ' +
        'the first and last. Use for "is the loss still coming down", "did it plateau". Not every ' +
        'epoch on purpose: the full series is thousands of numbers and answers no better.',
      inputSchema: {
        training: z.string().describe('The training id, from list_trainings'),
        points: z
          .number()
          .int()
          .min(2)
          .max(40)
          .optional()
          .describe('How many epochs to sample (default 12). Raise only if the shape is genuinely unclear.')
      }
    },
    async ({ training, points }) => {
      const wanted = points ?? CURVE_POINTS;

      try {
        // Sampled by vision-service, so the 196 KB a long run would otherwise
        // serialize and ship is never built. It still samples here as well: an
        // older vision-service ignores the parameter and answers in full, and
        // sampling an already-sampled series is a no-op.
        const { training: details, epochs, totalEpochs } = await vision.getTrainingWithEpochs(
          key,
          training,
          wanted
        );
        if (epochs.length === 0) return ok(`${details.name} has recorded no epochs yet.`);

        const picked = sample(epochs, wanted);
        const total = totalEpochs ?? epochs.length;
        const lines = [
          `${details.name} [${details.status}] — ${count(total)} epochs, ` +
            `showing ${count(picked.length)} of them:`,
          ...describeCurve(picked)
        ];

        if (picked.length < total) {
          lines.push('', `(Sampled evenly from ${count(total)} epochs; the first and last are always included.)`);
        }

        return ok(lines.join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'compare_trainings',
    {
      title: 'Compare training runs',
      description:
        'Runs side by side: epochs, time, cost, benchmarks, and each metric\'s final value plus the ' +
        'best and worst it reached and where. Judge on the range, not the final epoch — a run ' +
        'trained past its peak ends on a number nobody would report.',
      inputSchema: {
        trainings: z
          .array(z.string())
          .min(2)
          .max(30)
          .describe('Training ids, from list_trainings. Between 2 and 30.')
      }
    },
    async ({ trainings }) => {
      try {
        const { comparison } = await vision.compareTrainings(key, trainings);

        if (comparison.length === 0) {
          return ok('None of those runs are visible to this key.');
        }

        const lines: string[] = [];
        if (comparison.length < trainings.length) {
          // Said rather than silently dropped: the comparison is answering a
          // different question than the one asked, and the model should say so.
          lines.push(
            `${count(comparison.length)} of the ${count(trainings.length)} runs asked for are ` +
              'visible to this key; the rest are in projects it cannot see.',
            ''
          );
        }

        const maxRanges = rangesPerRun(comparison.length);
        for (const entry of comparison) {
          lines.push(...describeComparisonEntry(entry, maxRanges), '');
        }

        lines.push(
          'A run\'s final epoch is not its result: training past the point of best validation is',
          'normal, and the checkpoint anyone would actually ship is the best one, not the last.',
          'Where a metric ends far from its best end, say so — that gap is the finding.'
        );

        return ok(lines.join('\n').trimEnd());
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_test_results',
    {
      title: 'Per-class evaluation scores',
      description:
        'Evaluation results broken down by condition and class: IoU, precision, recall, F1 and ' +
        'AP. Use for "how well does it do on X", "which classes is it worst at".',
      inputSchema: {
        training: z.string().optional().describe('Training id, to scope to one run'),
        epoch: z.number().int().optional().describe('Only results for this epoch number'),
        limit: z.number().int().min(1).max(20).optional().describe('How many results (default 5)')
      }
    },
    async ({ training, epoch, limit }) => {
      try {
        const { testResults } = await vision.listTestResults(key, {
          training_uuid: training ? await resolveTrainingUuid((id) => vision.getTraining(key, id), training) : undefined,
          epoch,
          limit: limit ?? 5
        });

        if (testResults.length === 0) return ok('No test results match that.');

        const lines: string[] = [];
        for (const result of testResults) {
          lines.push(...describeTestResult(result), '');
        }
        return ok(lines.join('\n').trimEnd());
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_benchmarks',
    {
      title: 'Model size and speed',
      description:
        'What a model costs to run: parameter count, FLOPs, frames per second, latency and peak ' +
        'GPU memory, with the hardware it was measured on. Use for "how fast is it", "will it ' +
        'fit", "how big is the model".',
      inputSchema: {
        training: z.string().optional().describe('Training id, to scope to one run'),
        limit: z.number().int().min(1).max(20).optional().describe('How many benchmarks (default 5)')
      }
    },
    async ({ training, limit }) => {
      try {
        const { benchmarks } = await vision.listBenchmarks(key, {
          training_uuid: training ? await resolveTrainingUuid((id) => vision.getTraining(key, id), training) : undefined,
          limit: limit ?? 5
        });

        if (benchmarks.length === 0) return ok('No benchmarks match that.');

        const lines: string[] = [];
        for (const benchmark of benchmarks) {
          lines.push(...describeBenchmark(benchmark), '');
        }
        return ok(lines.join('\n').trimEnd());
      } catch (error) {
        return explain(error);
      }
    }
  );
}

function registerWriteTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description:
        'Make a new project to group training runs under. Projects are private unless made ' +
        'public. Ask the user before creating one — a project is a thing they will see in the app.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('What to call it'),
        description: z.string().max(2000).optional().describe('What it is for'),
        isPublic: z
          .boolean()
          .optional()
          .describe('Whether anyone can see it. Defaults to private; only set true if the user said so.')
      },
      // Adds a project; touches nothing that already exists. The two update
      // tools below leave the hint alone, because overwriting a name or
      // replacing a run's tags does lose what was there.
      annotations: { destructiveHint: false }
    },
    async ({ name, description, isPublic }) => {
      try {
        const project = await vision.createProject(key, { name, description, isPublic });
        return ok(
          `Created "${project.name}" (${project.isPublic ? 'public' : 'private'}), ` +
            `slug ${project.slug ?? project._id}.`
        );
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'update_project',
    {
      title: 'Rename or re-describe a project',
      description:
        'Change a project\'s name, description or visibility. Making a project public exposes ' +
        'every run in it to anyone — confirm with the user before doing that.',
      inputSchema: {
        project: z.string().describe('The project id, from list_projects'),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        isPublic: z.boolean().optional().describe('Only change this when the user explicitly asked')
      }
    },
    async ({ project, name, description, isPublic }) => {
      try {
        const updated = await vision.updateProject(key, project, { name, description, isPublic });
        return ok(`Updated "${updated.name}" (${updated.isPublic ? 'public' : 'private'}).`);
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'update_training',
    {
      title: 'Rename or retag a run',
      description:
        'Change a training run\'s name, description, status or tags. Note that nothing here can ' +
        'add or change measurements: epochs, test results and benchmarks are written by the ' +
        'training pipeline itself.',
      inputSchema: {
        training: z.string().describe('The training id, from list_trainings'),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        tags: z.array(z.string()).max(20).optional().describe('Replaces the existing tags')
      }
    },
    async ({ training, name, description, status, tags }) => {
      try {
        const updated = await vision.updateTraining(key, training, {
          name,
          description,
          status,
          tags
        });
        return ok(`Updated "${updated.name}" [${updated.status}].`);
      } catch (error) {
        return explain(error);
      }
    }
  );
}

export const visionRead: ToolModule = { scopes: ['vision:read'], register: registerReadTools };
export const visionWrite: ToolModule = { scopes: ['vision:write'], register: registerWriteTools };
