import Evaluation from '../models/Evaluation';

/**
 * What a run recorded without a suite (a test it reported: results, no ranking) belongs to the run. It goes to the
 * trash with the run, its epoch or its project, comes back with them, and is deleted with the run, exactly as a run's
 * epochs and benchmarks are. A result judged on a suite does not: it is evidence on a leaderboard's terms, and the
 * run it names being trashed does not take it out of the ranking by itself.
 *
 * Each delete stamps only the rows still live, so the stamp names what that delete removed, which is what the matching
 * restore brings back; anything trashed on its own beforehand keeps its own time and stays in the trash.
 */
export interface RunScope {
  trainingIds?: string[];
  epochUuids?: string[];
}

const unranked = { suite: { $exists: false } };

const within = ({ trainingIds, epochUuids }: RunScope) => ({
  $or: [
    ...(trainingIds?.length ? [{ 'source.trainingId': { $in: trainingIds } }] : []),
    ...(epochUuids?.length ? [{ 'source.epochUuid': { $in: epochUuids } }] : [])
  ]
});

const nothing = (scope: RunScope) => !scope.trainingIds?.length && !scope.epochUuids?.length;

export async function trashRunEvaluations(scope: RunScope, at: Date): Promise<void> {
  if (nothing(scope)) return;
  await Evaluation.updateMany({ ...unranked, ...within(scope), deletedAt: null }, { deletedAt: at });
}

export async function restoreRunEvaluations(scope: RunScope, at: Date): Promise<void> {
  if (nothing(scope)) return;
  await Evaluation.updateMany({ ...unranked, ...within(scope), deletedAt: at }, { $unset: { deletedAt: 1 } });
}

export async function purgeRunEvaluations(scope: RunScope): Promise<void> {
  if (nothing(scope)) return;
  await Evaluation.deleteMany({ ...unranked, ...within(scope) });
}
