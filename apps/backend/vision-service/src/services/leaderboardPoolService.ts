import type { QueryFilter } from 'mongoose';
import Evaluation, { type IEvaluation } from '../models/Evaluation';
import type { LeaderboardPageQuery } from '../validation/evaluationSchemas';

/** One selected summary per suite/checkpoint; raw results and provenance never leave MongoDB. */
export type PoolRow = Pick<
  IEvaluation,
  | '_id'
  | 'uuid'
  | 'projectId'
  | 'checkpoint'
  | 'checkpointKey'
  | 'suite'
  | 'status'
  | 'receivedAt'
  | 'validation'
  | 'sampleCounts'
  | 'executedAt'
  | 'publishedAt'
  | 'supersededById'
  | 'verifiedAt'
  | 'hiddenAt'
> & {
  attempts: number;
  lastPublishedAt: Date;
};

export interface PoolOptions {
  /**
   * Keep only the groups whose selected attempt is on a public board: published and not hidden by a manager of the suite. The attempt is chosen among *all* live attempts first, so publishing
   * one result cannot hide the newer ones: a newer ranked attempt that is not published takes the row off a public
   * board until it is published too.
   */
  publishedOnly?: boolean;
}

/**
 * Apply the caller's complete permission filter, then select, for every (suite, project, checkpoint), the latest
 * eligible attempt. Another project's evaluation of the same checkpoint is another row, never a replacement.
 */
export async function leaderboardPool(filter: QueryFilter<IEvaluation>, { publishedOnly = false }: PoolOptions = {}): Promise<PoolRow[]> {
  return Evaluation.aggregate<PoolRow>([
    { $match: filter },
    {
      $project: {
        uuid: 1,
        projectId: 1,
        checkpoint: 1,
        checkpointKey: 1,
        suite: 1,
        status: 1,
        receivedAt: 1,
        validation: 1,
        sampleCounts: 1,
        executedAt: 1,
        publishedAt: 1,
        supersededById: 1,
        verifiedAt: 1,
        hiddenAt: 1
      }
    },
    {
      $set: {
        eligible: {
          $and: [
            { $eq: ['$status', 'completed'] },
            { $eq: ['$validation.state', 'eligible'] },
            { $eq: [{ $type: '$validation.scores' }, 'object'] },
            // A corrected result is replaced by its correction, whatever the correction turned out to be.
            { $eq: [{ $type: '$supersededById' }, 'missing'] }
          ]
        }
      }
    },
    { $sort: { eligible: -1, receivedAt: -1, _id: 1 } },
    {
      $group: {
        _id: { suite: '$suite.id', project: '$projectId', checkpoint: '$checkpointKey' },
        evaluation: { $first: '$$ROOT' },
        attempts: { $sum: 1 },
        lastPublishedAt: { $max: '$publishedAt' }
      }
    },
    {
      $replaceRoot: {
        newRoot: { $mergeObjects: ['$evaluation', { attempts: '$attempts', lastPublishedAt: '$lastPublishedAt' }] }
      }
    },
    { $unset: 'eligible' },
    ...(publishedOnly ? [{ $match: { publishedAt: { $type: 'date' }, hiddenAt: { $exists: false } } }] : [])
  ]).allowDiskUse(true);
}

export const DEFAULT_LEADERBOARD_PAGE: LeaderboardPageQuery = { page: 1, limit: 100 };

/** Page summaries only after selection and ranking across the full pool. */
export function leaderboardPage<T>(rows: T[], query: LeaderboardPageQuery) {
  return {
    rows: rows.slice((query.page - 1) * query.limit, query.page * query.limit),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: rows.length,
      pages: Math.ceil(rows.length / query.limit)
    }
  };
}

/**
 * The id of the attempt a board shows for one checkpoint as one project recorded it on a suite: its latest ranked
 * attempt, the same choice `leaderboardPool` makes. Publishing, and a public page for one result, both hold to it.
 */
export async function selectedAttemptId(projectId: string, suiteId: string, checkpointKey: string): Promise<string | undefined> {
  const latest = await Evaluation.findOne({
    projectId,
    'suite.id': suiteId,
    checkpointKey,
    deletedAt: null,
    status: 'completed',
    'validation.state': 'eligible',
    supersededById: { $exists: false }
  })
    .sort({ receivedAt: -1, _id: 1 })
    .select('_id');
  return latest?._id.toString();
}
