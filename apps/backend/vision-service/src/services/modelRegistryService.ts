import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import Epoch from '../models/Epoch';
import Project from '../models/Project';
import Training, { type ITraining } from '../models/Training';
import { tokenProjectId } from '../middleware/projectTokenContext';
import type { ListModelsQuery } from '../validation/modelRegistrySchemas';
import { checkpointAddress, evaluationsByCheckpoint } from './checkpointEvaluations';
import { evaluationScope } from './evaluationScope';
import { modelLinkKey, modelLinkLabel } from './sourceRegistry';
import { checkProjectAccess, getVisibleProjectIds, resolveProject } from './projectAccessService';
import { metricLeaves } from './resultMetrics';

/** Runs read per request. A registry past this is narrowed by project, not paged deeper. */
const MAX_RUNS = 2000;

export interface Best {
  metric: string;
  direction: 'max' | 'min';
  value: number;
  epoch: number;
}

/** Runs whose latest epoch is read to find out which results a set of runs reports. */
const SAMPLE_RUNS = 20;

/**
 * The latest epoch of each of up to `SAMPLE_RUNS` runs. One epoch per run, not the newest
 * epochs overall: those usually all come from the single longest run, and that run's
 * habits would stand for everyone's.
 */
export async function latestEpochs(trainingIds: string[]): Promise<{ results: Record<string, unknown> }[]> {
  const rows = await Epoch.aggregate<{ results?: Record<string, unknown> }>([
    { $match: { trainingId: { $in: trainingIds.slice(0, SAMPLE_RUNS) }, deletedAt: null } },
    { $sort: { epoch: -1 } },
    { $group: { _id: '$trainingId', results: { $first: '$results' } } }
  ]);
  return rows.map(row => ({ results: row.results ?? {} }));
}

/**
 * The keys a result path stands for. A key can hold a dot (`val.map_0.5`), so the path
 * alone is ambiguous; the runs' own results settle it, and a path none of them reports
 * is read as plain dotted keys.
 */
export async function resolveSegments(trainingIds: string[], metric: string): Promise<string[]> {
  for (const { results } of await latestEpochs(trainingIds)) {
    const leaf = metricLeaves(results).find(candidate => candidate.path === metric);
    if (leaf) return leaf.segments;
  }
  return metric.split('.');
}

/**
 * The best value each run reached for a result, and the epoch it reached it at.
 * Results are open blobs, so this reads whatever number sits at the path; a run
 * that never reported it has no entry. Whether larger is better is the caller's
 * call: a registry spans projects, and each decides its own `direction`.
 *
 * `segments` are the result's keys, read one by one with `$getField`, so a key with a
 * dot or a `$` in it is looked up as itself and never taken for a path or an operator.
 * Without them, `metric` is split on its dots.
 */
export async function bestByRun(
  trainingIds: string[],
  metric: string,
  direction: 'max' | 'min',
  segments: string[] = metric.split('.')
): Promise<Map<string, Best>> {
  const value = segments.reduce<unknown>((input, key) => ({ $getField: { field: { $literal: key }, input } }), '$results');
  const rows = await Epoch.aggregate<{ _id: string; value: number; epoch: number }>([
    { $match: { trainingId: { $in: trainingIds }, deletedAt: null } },
    { $project: { trainingId: 1, epoch: 1, value } },
    { $match: { value: { $type: 'number' } } },
    { $sort: { value: direction === 'max' ? -1 : 1, epoch: 1 } },
    { $group: { _id: '$trainingId', value: { $first: '$value' }, epoch: { $first: '$epoch' } } }
  ]);
  return new Map(rows.map(row => [row._id, { metric, direction, value: row.value, epoch: row.epoch }]));
}

/**
 * What each run's epochs reported for a result, for the epochs a checkpoint was saved at.
 * Keyed `<trainingId>:<epoch>`; an epoch that never reported a number has no entry.
 */
export async function valuesAtEpochs(
  pairs: { trainingId: string; epoch: number }[],
  segments: string[]
): Promise<Map<string, number>> {
  if (pairs.length === 0) return new Map();
  const wanted = new Set(pairs.map(pair => `${pair.trainingId}:${pair.epoch}`));
  const value = segments.reduce<unknown>((input, key) => ({ $getField: { field: { $literal: key }, input } }), '$results');
  const rows = await Epoch.aggregate<{ trainingId: string; epoch: number; value: number }>([
    {
      $match: {
        trainingId: { $in: [...new Set(pairs.map(pair => pair.trainingId))] },
        epoch: { $in: [...new Set(pairs.map(pair => pair.epoch))] },
        deletedAt: null
      }
    },
    { $project: { trainingId: 1, epoch: 1, createdAt: 1, value } },
    { $match: { value: { $type: 'number' } } },
    { $sort: { createdAt: -1, _id: -1 } }
  ]);
  const values = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.trainingId}:${row.epoch}`;
    if (wanted.has(key) && !values.has(key)) values.set(key, row.value);
  }
  return values;
}

export async function scopedProjectIds(userId: string | undefined, projectId: string | undefined): Promise<string[]> {
  if (projectId) {
    const project = await resolveProject(projectId);
    if (!project) throw new NotFoundError('Project not found');
    if (!(await checkProjectAccess(userId, project._id.toString()))) throw new ForbiddenError('Access denied to project');
    return [project._id.toString()];
  }
  const visible = await getVisibleProjectIds(userId);
  const confined = tokenProjectId();
  return confined ? visible.filter(id => id === confined) : visible;
}

/**
 * The model registry: every Hub model linked to a run the caller may see, one
 * row per link, newest first or ranked by how well its run did.
 */
export async function listModels(userId: string | undefined, query: ListModelsQuery) {
  const projectIds = await scopedProjectIds(userId, query.projectId);
  const filter: QueryFilter<ITraining> = { deletedAt: null, projectId: { $in: projectIds }, 'models.0': { $exists: true } };
  if (query.datasetId) filter.$or = [{ datasetId: query.datasetId }, { 'dataset.id': query.datasetId }];
  const trainings = await Training.find(filter).sort({ createdAt: -1 }).limit(MAX_RUNS).lean();

  const needle = query.search?.toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(needle!);
  const rows = trainings.flatMap(training =>
    (training.models ?? [])
      .filter(model => !needle || matches(training.name) || matches(modelLinkLabel(model)))
      .map(model => ({ training, model }))
  );

  const runIds = [...new Set(rows.map(row => row.training._id.toString()))];
  const segments = query.metric ? await resolveSegments(runIds, query.metric) : [];
  const best = query.metric
    ? await bestByRun(runIds, query.metric, query.direction, segments)
    : new Map<string, Best>();
  // A checkpoint saved at an epoch is scored by that epoch, not by where its run peaked.
  const atEpoch = query.metric
    ? await valuesAtEpochs(
        rows.flatMap(row =>
          row.model.epoch === undefined ? [] : [{ trainingId: row.training._id.toString(), epoch: row.model.epoch }]
        ),
        segments
      )
    : new Map<string, number>();
  const direction = query.order;
  const ranked = rows
    .map(row => {
      const trainingId = row.training._id.toString();
      const value = row.model.epoch === undefined ? undefined : atEpoch.get(`${trainingId}:${row.model.epoch}`);
      const checkpoint: Best | undefined =
        query.metric && row.model.epoch !== undefined && value !== undefined
          ? { metric: query.metric, direction: query.direction, value, epoch: row.model.epoch }
          : undefined;
      // A link that names its epoch is ranked by that epoch alone: when the epoch reported
      // nothing it has no score, never the run's best from some other epoch.
      const score = row.model.epoch === undefined ? best.get(trainingId) : checkpoint;
      return { ...row, best: best.get(trainingId), checkpoint, score };
    })
    .sort((a, b) => {
      if (query.sortBy === 'best') {
        // A link with no score goes last, whichever way the list runs.
        if (!a.score || !b.score) return Number(!a.score) - Number(!b.score);
        return (a.score.value - b.score.value) * direction;
      }
      return (a.model.addedAt.getTime() - b.model.addedAt.getTime()) * direction;
    });

  const total = ranked.length;
  const page = ranked.slice((query.page - 1) * query.limit, query.page * query.limit);
  const shown = [...new Set(page.map(row => row.training.projectId))].filter((id): id is string => isValidObjectId(id));
  const projects = await Project.find({ _id: { $in: shown.map(id => new Types.ObjectId(id)) } }).select('name slug').lean();
  const named = new Map(projects.map(project => [project._id.toString(), { _id: project._id.toString(), name: project.name, slug: project.slug }]));

  // What each shown checkpoint scored on suites: matched by canonical key, in one query for the whole page.
  const keyOf = modelLinkKey;
  const evaluated = await evaluationsByCheckpoint(
    page.flatMap(row => (row.training.projectId ? [{ projectId: row.training.projectId, checkpointKey: keyOf(row.model) }] : [])),
    await evaluationScope(userId)
  );
  const evaluationsOf = (training: { projectId?: string }, model: Parameters<typeof keyOf>[0]) =>
    training.projectId ? evaluated.get(checkpointAddress(training.projectId, keyOf(model))) : undefined;

  return {
    models: page.map(({ training, model, best: reached, checkpoint }) => ({
      model,
      training: {
        _id: training._id.toString(),
        uuid: training.uuid,
        name: training.name,
        status: training.status,
        projectId: training.projectId,
        dataset: training.dataset,
        datasetId: training.datasetId,
        createdAt: training.createdAt
      },
      project: named.get(training.projectId ?? ''),
      ...(reached ? { best: reached } : {}),
      ...(checkpoint ? { checkpoint } : {}),
      ...(evaluationsOf(training, model) ? { evaluations: evaluationsOf(training, model) } : {})
    })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
  };
}
