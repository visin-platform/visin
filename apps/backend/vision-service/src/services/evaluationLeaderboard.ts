import { isValidObjectId, Types } from 'mongoose';
import Project from '../models/Project';
import type { SuiteLeaderboardQuery } from '../validation/evaluationSchemas';
import { buildLeaderboard, type Candidate } from './leaderboardProjection';
import { evaluationScope } from './evaluationScope';
import { readableSuite } from './suiteService';
import { DEFAULT_LEADERBOARD_PAGE, leaderboardPage, leaderboardPool } from './leaderboardPoolService';

export interface LeaderboardView {
  suite: {
    slug: string;
    version: number;
    name: string;
    digest: string;
    headline: { key: string; direction: 'max' | 'min'; unit?: string };
  };
  selection: 'latest-eligible-completed';
  /** the pool that was ranked: evaluations of this suite version the caller may read */
  scope: { candidates: number; truncated: boolean };
  entries: unknown[];
  unranked: unknown[];
  pagination: { page: number; limit: number; total: number; pages: number };
  unrankedPagination: { page: number; limit: number; total: number; pages: number };
}

/**
 * The ranking of one suite version, over the evaluations the caller may read. Rank is a position within that
 * pool, and the pool is reported, so a rank is never read as a standing among everything ever run.
 */
export async function suiteLeaderboard(
  slug: string,
  version: number | 'latest',
  userId: string | undefined,
  query: SuiteLeaderboardQuery = { ...DEFAULT_LEADERBOARD_PAGE, unrankedPage: 1 }
): Promise<LeaderboardView> {
  const suite = await readableSuite(slug, version, userId);
  const scope = await evaluationScope(userId);
  const where = {
    'suite.id': suite._id.toString(),
    deletedAt: null,
    checkpointKey: { $exists: true },
    ...(query.evidence ? { 'validation.evidence': query.evidence } : {})
  };
  // Where the caller can only read, the board holds what is published there: the rows a public board would show.
  const pool = [
    ...(await leaderboardPool({ ...where, projectId: { $in: scope.full } })),
    ...(await leaderboardPool({ ...where, projectId: { $in: scope.published } }, { publishedOnly: true }))
  ];

  const candidates: Candidate[] = pool.map((row) => ({
    id: row._id.toString(),
    attempts: row.attempts,
    checkpointKey: row.checkpointKey!,
    projectId: row.projectId,
    status: row.status,
    state: row.validation.state,
    scores: row.validation.scores,
    receivedAt: row.receivedAt
  }));
  const board = buildLeaderboard(suite.protocol, candidates);
  const rankedPage = leaderboardPage(board.entries, query);
  const unrankedPage = leaderboardPage(board.unranked, { ...query, page: query.unrankedPage });

  const byId = new Map(pool.map((row) => [row._id.toString(), row]));
  const projectIds = [...new Set(pool.map((row) => row.projectId))].filter((id) => isValidObjectId(id));
  const projects = await Project.find({ _id: { $in: projectIds.map((id) => new Types.ObjectId(id)) } })
    .select('name slug')
    .lean();
  const named = new Map(
    projects.map((project) => [
      project._id.toString(),
      { _id: project._id.toString(), name: project.name, slug: project.slug }
    ])
  );

  const describe = (id: string) => {
    const row = byId.get(id)!;
    return {
      uuid: row.uuid,
      checkpoint: row.checkpoint,
      project: named.get(row.projectId),
      evidenceLevel: row.validation.evidence ?? 'none',
      receivedAt: row.receivedAt,
      sampleCounts: row.sampleCounts
    };
  };
  const metric = suite.protocol.metrics.find((item) => item.headline)!;
  return {
    suite: {
      slug: suite.slug,
      version: suite.version,
      name: suite.name,
      digest: suite.digest,
      headline: { key: metric.key, direction: metric.direction, ...(metric.unit ? { unit: metric.unit } : {}) }
    },
    selection: board.selection,
    scope: { candidates: pool.reduce((count, row) => count + row.attempts, 0), truncated: false },
    pagination: rankedPage.pagination,
    unrankedPagination: unrankedPage.pagination,
    entries: rankedPage.rows.map((entry) => ({ ...entry, ...describe(entry.evaluationId) })),
    unranked: unrankedPage.rows.map((row) => ({
      ...row,
      ...describe(row.evaluationId),
      reasons: byId.get(row.evaluationId)!.validation.reasons
    }))
  };
}
