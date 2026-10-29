import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vision } from '../vision';
import { isHubRunModel } from '../schemas';
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

import {
  describeBenchmark,
  describeComparisonEntry,
  describeEpoch,
  describePeaks,
  describeRanges,
  describeTestResult,
  describeTraining,
  rangesPerRun
} from './visionDescribe';

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
          const visibility = project.visibility;
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
          `${details.name} (${details.visibility})`,
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
        const [{ training: details, epochs }, configs, summary] = await Promise.all([
          vision.getTrainingWithEpochs(key, training),
          vision.getTrainingConfigs(key, training).catch(() => []),
          // Like the configs: context that sharpens the answer, never a reason to lose it.
          vision.getTrainingSummary(key, training).catch(() => null)
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

        const peaks = summary?.metrics.length ? describePeaks(summary.metrics) : [];
        const best = peaks.length > 0 ? [] : describeRanges(epochs);
        if (peaks.length > 0) lines.push('', ...peaks);
        else if (best.length > 0) {
          lines.push(
            '',
            'Across every epoch — which direction is better for a metric is not known here,',
            'so both ends are given:',
            ...best
          );
        }

        for (const model of summary?.models ?? []) {
          if (isHubRunModel(model)) {
            lines.push('', `Model on Hugging Face: ${model.repo} @ ${model.revision.slice(0, 7)}${model.space ? `, demo space ${model.space}` : ''}.`);
            continue;
          }
          const size = model.size === undefined ? '' : `, ${(model.size / 1024 ** 3).toFixed(2)} GB`;
          const licence = model.license ? `licence ${model.license.name ?? model.license.id}` : 'licence not stated, so it is not offered for download';
          const state = model.status && model.status !== 'ready' ? `, ${model.status}` : '';
          lines.push(
            '',
            `Model kept on Visin: ${model.filename ?? `${model.format} checkpoint`} (${model.format}${size}${model.epoch === undefined ? '' : `, epoch ${model.epoch}`}${state}), ${licence}.`
          );
        }
        if ((summary?.models ?? []).some((model) => !isHubRunModel(model))) {
          lines.push('get_model_outputs describes a kept model: its classes, data, outputs and tests.');
        }
        const git = summary?.provenance?.git;
        if (git) {
          lines.push(
            '',
            `Started from commit ${git.commit.slice(0, 7)}${git.branch ? ` on ${git.branch}` : ''}` +
              `${git.dirty ? ', with local changes in the working tree' : ''}.`
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
          trainingUuid: training ? await resolveTrainingUuid((id) => vision.getTraining(key, id), training) : undefined,
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

export const visionRead: ToolModule = { scopes: ['vision:read'], register: registerReadTools };
export { visionWrite } from './visionWrite';
