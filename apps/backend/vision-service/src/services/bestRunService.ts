import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import Project from '../models/Project';
import Training, { type ITraining } from '../models/Training';
import type { BestRunQuery } from '../validation/bestRunSchemas';
import { bestByRun, latestEpochs, scopedProjectIds } from './modelRegistryService';
import { metricLeaves } from './resultMetrics';
import { directionOf } from './trainingSummaryService';

/** Runs looked at per request; a project past this is judged on its newest. */
const MAX_RUNS = 2000;
/**
 * When a project has not named its headline result, these are tried in order, on the
 * validation block first. They are names a result commonly has, not a vocabulary a
 * pipeline must use: a project reporting something else just has to name its own.
 */
const QUALITY_LEAVES = ['mean_iou', 'miou', 'miou_foreground', 'map', 'map_50', 'accuracy', 'top1', 'f1_score', 'f1', 'dice_score', 'ap', 'iou'];
const VALIDATION_BLOCKS = ['val', 'validation'];

const normal = (name: string) => name.toLowerCase();

/**
 * The result a project's runs are ranked on. The project's own `primaryMetric` wins;
 * otherwise a quality score from the validation block, otherwise the validation loss.
 * `null` when the runs report nothing that reads as a score, because crowning a run
 * on an arbitrary number would be worse than showing no badge.
 */
export function headlineMetric(paths: string[], primary: string | undefined): { path: string; source: 'project' | 'guessed' } | null {
  if (primary) return { path: primary, source: 'project' };
  const inValidation = paths.filter(path => VALIDATION_BLOCKS.includes(normal(path.split('.')[0])) && path.includes('.'));
  const pool = inValidation.length ? inValidation : paths;
  for (const leaf of QUALITY_LEAVES) {
    const found = pool.filter(path => normal(path.split('.').pop() ?? '') === leaf).sort()[0];
    if (found) return { path: found, source: 'guessed' };
  }
  const loss = pool.filter(path => normal(path.split('.').pop() ?? '') === 'loss').sort()[0];
  return loss ? { path: loss, source: 'guessed' } : null;
}

interface Candidate {
  projectId: string;
  runs: number;
  path: string;
  source: 'project' | 'guessed';
  direction: 'higher' | 'lower';
  directionFrom: 'taxonomy' | 'default';
  best: { trainingId: string; value: number; epoch: number } | null;
}

async function candidateFor(projectId: string, runIds: string[], primary: string | undefined, taxonomyMetrics: { key: string; direction?: 'higher' | 'lower' }[] | undefined): Promise<Candidate | null> {
  // The latest epoch of several runs, so the headline is what the runs report, not what one long run does.
  const segmentsOf = new Map<string, string[]>();
  for (const { results } of await latestEpochs(runIds)) {
    for (const leaf of metricLeaves(results)) segmentsOf.set(leaf.path, leaf.segments);
  }
  const headline = headlineMetric([...segmentsOf.keys()], primary);
  if (!headline) return null;

  const { direction, directionFrom } = directionOf(headline.path, taxonomyMetrics);
  const reached = await bestByRun(runIds, headline.path, direction === 'higher' ? 'max' : 'min', segmentsOf.get(headline.path));
  const winner = [...reached].sort(([, a], [, b]) => (direction === 'higher' ? b.value - a.value : a.value - b.value) || a.epoch - b.epoch)[0];
  return {
    projectId,
    runs: runIds.length,
    ...headline,
    direction,
    directionFrom,
    best: winner ? { trainingId: winner[0], value: winner[1].value, epoch: winner[1].epoch } : null
  };
}

/**
 * The best run of a project, or of a dataset across the projects the caller can see.
 *
 * "Best" is one result, so the answer always says which, and in which direction: a
 * run is only the best at something. A project can name its headline result
 * (`taxonomy.primaryMetric`); without that it is guessed, and the answer says so.
 * Across projects whose headlines differ, the one with the most runs on the dataset
 * decides, since a loss and an IoU cannot be compared.
 */
export async function getBestRun(userId: string | undefined, query: BestRunQuery) {
  const projectIds = await scopedProjectIds(userId, query.projectId);
  const filter: QueryFilter<ITraining> = { deletedAt: null, projectId: { $in: projectIds } };
  if (query.datasetId) filter.$or = [{ datasetId: query.datasetId }, { 'dataset.id': query.datasetId }];
  const trainings = await Training.find(filter).sort({ createdAt: -1 }).limit(MAX_RUNS).select('_id projectId name uuid status').lean();
  if (trainings.length === 0) return { runs: 0, best: null };

  const byProject = new Map<string, string[]>();
  for (const training of trainings) {
    const id = training.projectId ?? '';
    byProject.set(id, [...(byProject.get(id) ?? []), training._id.toString()]);
  }
  const projects = await Project.find({ _id: { $in: [...byProject.keys()].filter(isValidObjectId).map(id => new Types.ObjectId(id)) } })
    .select('name slug taxonomy.primaryMetric taxonomy.metrics')
    .lean();

  const candidates = (
    await Promise.all(
      projects.map(project =>
        candidateFor(
          project._id.toString(),
          byProject.get(project._id.toString()) ?? [],
          project.taxonomy?.primaryMetric,
          project.taxonomy?.metrics as { key: string; direction?: 'higher' | 'lower' }[] | undefined
        )
      )
    )
  ).filter((candidate): candidate is Candidate => candidate !== null && candidate.best !== null);
  if (candidates.length === 0) return { runs: trainings.length, best: null };

  // Candidates measuring the same thing compete; the most-used measure decides what that is.
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.path}|${candidate.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const [group] = [...groups.values()].sort(
    (a, b) => b.reduce((n, c) => n + c.runs, 0) - a.reduce((n, c) => n + c.runs, 0) || a[0].path.localeCompare(b[0].path)
  );
  const winner = group.sort((a, b) => (a.direction === 'higher' ? b.best!.value - a.best!.value : a.best!.value - b.best!.value))[0];

  const training = trainings.find(run => run._id.toString() === winner.best!.trainingId)!;
  const project = projects.find(item => item._id.toString() === winner.projectId)!;
  return {
    runs: trainings.length,
    best: {
      training: { _id: training._id.toString(), uuid: training.uuid, name: training.name, status: training.status, projectId: training.projectId },
      project: { _id: project._id.toString(), name: project.name, slug: project.slug },
      metric: { path: winner.path, direction: winner.direction, directionFrom: winner.directionFrom, source: winner.source },
      value: winner.best!.value,
      epoch: winner.best!.epoch
    }
  };
}
