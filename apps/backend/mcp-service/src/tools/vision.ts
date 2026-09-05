import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vision } from '../vision';
import type { Benchmark, ComparisonEntry, Epoch, TestResult, Training } from '../schemas';
import {
  Caller,
  ToolModule,
  capped,
  count,
  day,
  duration,
  explain,
  metric,
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

/** A Mongo ObjectId is 24 hex characters; a UUID is 8-4-4-4-12. Unambiguous. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn whatever identifier the model has into the one the endpoint filters on.
 *
 * `list_trainings` hands out `_id`, and every tool here takes that — but
 * `/test-results` and `/benchmarks` filter on `training_uuid`, a different
 * field. Passing the id filtered nothing at all: zod drops an unknown query key
 * silently, so the call succeeded and returned every run's results as though
 * they were the one asked for. One extra lookup is worth not answering the
 * wrong question.
 */
async function resolveTrainingUuid(apiKey: string, training: string): Promise<string> {
  if (UUID.test(training)) return training;

  const run = await vision.getTraining(apiKey, training);
  if (!run.uuid) {
    // Deliberately not a VisinError: `explain` would dress a 404 up with a note
    // about private projects, and this is neither missing nor forbidden.
    throw new Error(
      `Training ${training} has no uuid recorded, so results cannot be scoped to it.`
    );
  }
  return run.uuid;
}

const describeTraining = (training: Training): string => {
  const parts = [`- ${training.name} [${training.status}]`];
  if (training.metrics?.epochCount) {
    parts.push(`${count(training.metrics.epochCount)} epochs`);
  }
  if (training.metrics?.totalTime) parts.push(duration(training.metrics.totalTime));
  if (training.tags.length > 0) parts.push(training.tags.join(', '));
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
 * The best value each metric reached, and where.
 *
 * Reported without judging direction: this server cannot know whether a metric
 * is one to maximise (mAP) or minimise (loss), and guessing from the name would
 * be wrong on exactly the custom metrics that matter most to whoever defined
 * them. Both ends are given, and the model can say which is better.
 */
function extremes(epochs: Epoch[]): string[] {
  const seen = new Map<string, { min: [number, number]; max: [number, number] }>();

  for (const epoch of epochs) {
    for (const [key, value] of numericResults(epoch.results)) {
      const current = seen.get(key);
      if (!current) {
        seen.set(key, { min: [value, epoch.epoch], max: [value, epoch.epoch] });
        continue;
      }
      if (value < current.min[0]) current.min = [value, epoch.epoch];
      if (value > current.max[0]) current.max = [value, epoch.epoch];
    }
  }

  return [...seen.entries()].map(
    ([key, { min, max }]) =>
      `- ${key}: lowest ${metric(min[0])} at epoch ${min[1]}, highest ${metric(max[0])} at epoch ${max[1]}`
  );
}

/** A test result's per-class scores, as a table rather than nested JSON. */
function describeTestResult(result: TestResult): string[] {
  const lines: string[] = [];
  const label = result.training?.name ? `${result.training.name}, ` : '';
  lines.push(`${label}epoch ${result.epoch ?? '?'} (${day(result.timestamp)}):`);

  for (const [condition, classes] of Object.entries(result.test_results)) {
    lines.push(`  ${condition}:`);
    for (const [className, scores] of Object.entries(classes)) {
      const parts = [
        scores.iou !== undefined ? `IoU ${metric(scores.iou)}` : '',
        scores.precision !== undefined ? `P ${metric(scores.precision)}` : '',
        scores.recall !== undefined ? `R ${metric(scores.recall)}` : '',
        scores.f1_score !== undefined ? `F1 ${metric(scores.f1_score)}` : '',
        scores.ap !== undefined ? `AP ${metric(scores.ap)}` : ''
      ].filter(Boolean);
      lines.push(`    ${className}: ${parts.join('  ')}`);
    }
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
function describeComparisonEntry(entry: ComparisonEntry): string[] {
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
        'A run: its status, how long it took, how many epochs it recorded, and what the last ' +
        'epoch measured. Use for "how did run X go". For the shape of the curve rather than its ' +
        'endpoint, use get_training_curve.',
      inputSchema: { training: z.string().describe('The training id, from list_trainings') }
    },
    async ({ training }) => {
      try {
        const { training: details, epochs } = await vision.getTrainingWithEpochs(key, training);

        const lines = [
          `${details.name} [${details.status}]`,
          details.description ?? '',
          ''
        ];

        const started = details.startTime ?? details.createdAt;
        if (started) lines.push(`Started ${day(started)}${details.endTime ? `, ended ${day(details.endTime)}` : ''}.`);
        if (details.tags.length > 0) lines.push(`Tags: ${details.tags.join(', ')}.`);
        if (details.datasetId) lines.push(`Dataset: ${details.datasetId}.`);

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

        const best = extremes(epochs);
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
        'The metric curve of a run, sampled down to about a dozen evenly spaced epochs plus the ' +
        'first and last. Use for "is the loss still coming down", "did it plateau", "when did it ' +
        'stop improving". Deliberately not every epoch: the full series is thousands of numbers ' +
        'and answers the question no better.',
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
      try {
        const { training: details, epochs } = await vision.getTrainingWithEpochs(key, training);
        if (epochs.length === 0) return ok(`${details.name} has recorded no epochs yet.`);

        const picked = sample(epochs, points ?? CURVE_POINTS);
        const lines = [
          `${details.name} [${details.status}] — ${count(epochs.length)} epochs, ` +
            `showing ${count(picked.length)} of them:`,
          ...picked.map(describeEpoch)
        ];

        if (picked.length < epochs.length) {
          lines.push('', `(Sampled evenly from ${count(epochs.length)} epochs; the first and last are always included.)`);
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
        'Two or more runs side by side: epochs, time, compute cost, final metrics and headline ' +
        'benchmark figures. Use for "which of these is better", "what changed between X and Y".',
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

        for (const entry of comparison) {
          lines.push(...describeComparisonEntry(entry), '');
        }
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
          training_uuid: training ? await resolveTrainingUuid(key, training) : undefined,
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
          training_uuid: training ? await resolveTrainingUuid(key, training) : undefined,
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
      }
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
