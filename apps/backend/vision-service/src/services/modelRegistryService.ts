import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import Epoch from '../models/Epoch';
import Project from '../models/Project';
import Training, { type ITraining } from '../models/Training';
import { tokenProjectId } from '../middleware/projectTokenContext';
import type { ListModelsQuery } from '../validation/modelRegistrySchemas';
import { checkProjectAccess, getVisibleProjectIds, resolveProject } from './projectAccessService';

/** Runs read per request. A registry past this is narrowed by project, not paged deeper. */
const MAX_RUNS = 2000;

export interface Best {
  metric: string;
  direction: 'max' | 'min';
  value: number;
  epoch: number;
}

/**
 * The best value each run reached for `metric`, and the epoch it reached it at.
 * Results are open blobs, so this reads whatever number sits at the path; a run
 * that never reported it has no entry. Whether larger is better is the caller's
 * call: a registry spans projects, and each decides its own `direction`.
 */
export async function bestByRun(trainingIds: string[], metric: string, direction: 'max' | 'min'): Promise<Map<string, Best>> {
  const field = `results.${metric}`;
  const rows = await Epoch.aggregate<{ _id: string; value: number; epoch: number }>([
    { $match: { trainingId: { $in: trainingIds }, deletedAt: null, [field]: { $type: 'number' } } },
    { $sort: { [field]: direction === 'max' ? -1 : 1, epoch: 1 } },
    { $group: { _id: '$trainingId', value: { $first: `$${field}` }, epoch: { $first: '$epoch' } } }
  ]);
  return new Map(rows.map(row => [row._id, { metric, direction, value: row.value, epoch: row.epoch }]));
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
      .filter(model => !needle || matches(training.name) || matches(model.repo))
      .map(model => ({ training, model }))
  );

  const best = query.metric
    ? await bestByRun([...new Set(rows.map(row => row.training._id.toString()))], query.metric, query.direction)
    : new Map<string, Best>();
  const direction = query.order;
  const ranked = rows
    .map(row => ({ ...row, best: best.get(row.training._id.toString()) }))
    .sort((a, b) => {
      if (query.sortBy === 'best') {
        // A run with no value for the metric goes last, whichever way the list runs.
        if (!a.best || !b.best) return Number(!a.best) - Number(!b.best);
        return (a.best.value - b.best.value) * direction;
      }
      return (a.model.addedAt.getTime() - b.model.addedAt.getTime()) * direction;
    });

  const total = ranked.length;
  const page = ranked.slice((query.page - 1) * query.limit, query.page * query.limit);
  const shown = [...new Set(page.map(row => row.training.projectId))].filter((id): id is string => isValidObjectId(id));
  const projects = await Project.find({ _id: { $in: shown.map(id => new Types.ObjectId(id)) } }).select('name slug').lean();
  const named = new Map(projects.map(project => [project._id.toString(), { _id: project._id.toString(), name: project.name, slug: project.slug }]));

  return {
    models: page.map(({ training, model, best: reached }) => ({
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
      ...(reached ? { best: reached } : {})
    })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
  };
}
