import { atLeast, ForbiddenError, NotFoundError, UnauthorizedError } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import Evaluation from '../models/Evaluation';
import Project from '../models/Project';
import Training from '../models/Training';
import type { RecordedLeaderboardQuery } from '../validation/evaluationSchemas';
import { evaluationScope, readerVisible, visibleToReader } from './evaluationScope';
import { projectPermission, resolveProject } from './projectAccessService';
import { directionOf } from './trainingSummaryService';
import { metricLeaves } from './resultMetrics';
import { publicCheckpoint } from './sourceRegistry';
import { invalidatePublic } from './publicCache';
import { leaderboardPage } from './leaderboardPoolService';

/** A manager's review changes neither the recorded score nor the protocol verdict. */
export async function verifyEvaluation(id: string, userId: string | undefined, verified: boolean) {
  if (!userId) throw new UnauthorizedError('Authentication required');
  const evaluation = isValidObjectId(id) ? await Evaluation.findOne({ _id: id, deletedAt: null }) : null;
  const project = evaluation && isValidObjectId(evaluation.projectId) ? await Project.findById(evaluation.projectId) : null;
  const permission = await projectPermission(project, userId);
  if (!evaluation || !atLeast(permission, 'read') || (!atLeast(permission, 'contribute') && !visibleToReader(evaluation))) {
    throw new NotFoundError('Evaluation not found');
  }
  if (!atLeast(permission, 'manage')) {
    throw new ForbiddenError('Manage access to the project is required to verify a result');
  }
  if (verified && !evaluation.verifiedAt) {
    evaluation.verifiedAt = new Date();
    evaluation.verifiedBy = userId;
    await evaluation.save();
    invalidatePublic();
  } else if (!verified && evaluation.verifiedAt) {
    evaluation.verifiedAt = undefined;
    evaluation.verifiedBy = undefined;
    await evaluation.save();
    invalidatePublic();
  }
  return { verified: Boolean(evaluation.verifiedAt), ...(evaluation.verifiedAt ? { verifiedAt: evaluation.verifiedAt, verifiedBy: evaluation.verifiedBy } : {}) };
}

/**
 * Scores already visible on the evaluations page, including migrated tests. No result is published by being ranked.
 * Keep the latest completed attempt per checkpoint (or source run when no checkpoint was recorded), before filtering
 * on verification, so an old verified attempt cannot stand in for a newer unverified result of the same model.
 * The metric is selected by its recorded path; scores from different data remain labelled by their project and run.
 */
export async function recordedLeaderboard(userId: string | undefined, query: RecordedLeaderboardQuery) {
  const scope = await evaluationScope(userId);
  const project = query.projectId ? await resolveProject(query.projectId) : undefined;
  const rows = await Evaluation.find({
    deletedAt: null,
    status: 'completed',
    supersededById: { $exists: false },
    hiddenAt: { $exists: false },
    $or: [{ projectId: { $in: scope.full } }, { projectId: { $in: scope.published }, ...readerVisible }],
    ...(query.projectId ? { projectId: project?._id.toString() ?? '' } : {})
  }).select('projectId source checkpoint checkpointKey suite results verifiedAt receivedAt executedAt').sort({ receivedAt: -1, _id: 1 }).lean();
  const trainingIds = [...new Set(rows.flatMap(row => row.source?.trainingId ? [row.source.trainingId] : []))].filter(id => isValidObjectId(id));
  const [projects, trainings] = await Promise.all([
    Project.find({ _id: { $in: [...new Set(rows.map(row => row.projectId))] } }).select('name slug').lean(),
    Training.find({ _id: { $in: trainingIds }, deletedAt: null }).select('projectId name dataset').lean()
  ]);
  const byProject = new Map(projects.map(row => [row._id.toString(), row]));
  const byRun = new Map(trainings.map(row => [row._id.toString(), row]));
  const selected = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.projectId}\u0000${row.suite?.id ?? ''}\u0000${row.checkpointKey ?? row.source?.trainingId ?? row._id.toString()}`;
    if (!selected.has(key)) selected.set(key, row);
  }
  const metrics = [...new Set([...selected.values()].flatMap(row => metricLeaves(row.results).map(metric => metric.path)))].sort((a, b) =>
    Number(b.startsWith('overall.')) - Number(a.startsWith('overall.')) || a.localeCompare(b)
  );
  const metric = query.metric ?? metrics[0];
  const direction = query.direction ?? (directionOf(metric ?? '', project?.taxonomy?.metrics).direction === 'lower' ? 'min' : 'max');
  const candidates = [...selected.values()].flatMap(row => {
    const verified = Boolean(row.verifiedAt);
    if ((query.verification === 'verified' && !verified) || (query.verification === 'unverified' && verified)) return [];
    const value = metricLeaves(row.results).find(leaf => leaf.path === metric)?.value;
    if (value === undefined) return [];
    const project = byProject.get(row.projectId)!;
    const sourceRun = row.source?.trainingId ? byRun.get(row.source.trainingId) : undefined;
    const run = sourceRun?.projectId === row.projectId ? sourceRun : undefined;
    return [{
      evaluationId: row._id.toString(),
      checkpoint: publicCheckpoint(row.checkpoint),
      project: { id: row.projectId, name: project.name, ...(project.slug ? { slug: project.slug } : {}) },
      ...(run ? { run: { id: run._id.toString(), name: run.name }, ...(run.dataset ? { dataset: run.dataset.name } : {}) } : {}),
      ...(row.source?.epoch !== undefined ? { epoch: row.source.epoch } : {}),
      value,
      verified,
      receivedAt: row.receivedAt
    }];
  });
  candidates.sort((a, b) => (direction === 'max' ? b.value - a.value : a.value - b.value) || a.evaluationId.localeCompare(b.evaluationId));
  let rank = 0;
  const entries = candidates.map((row, index) => {
    if (index === 0 || row.value !== candidates[index - 1].value) rank = index + 1;
    return { rank, ...row };
  });
  const page = leaderboardPage(entries, query);
  return { metric, metrics, direction, verification: query.verification, entries: page.rows, pagination: page.pagination };
}
