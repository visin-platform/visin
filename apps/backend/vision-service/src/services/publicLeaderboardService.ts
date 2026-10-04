import { isValidObjectId, Types } from 'mongoose';
import { NotFoundError } from '@visin/backend-core';
import Evaluation from '../models/Evaluation';
import Project from '../models/Project';
import Suite, { type ISuite } from '../models/Suite';
import { publicCheckpoint, publicSuiteData } from './sourceRegistry';
import { renderBadge } from './badgeSvg';
import { cachedPublic } from './publicCache';
import { buildLeaderboard, type Candidate } from './leaderboardProjection';
import { DEFAULT_LEADERBOARD_PAGE, leaderboardPage, leaderboardPool, selectedAttemptId, type PoolRow } from './leaderboardPoolService';
import { resolveProject } from './projectAccessService';
import type { LeaderboardPageQuery, LeaderboardQuery } from '../validation/evaluationSchemas';

/**
 * What an anonymous visitor may see, and nothing else.
 *
 * Nothing here takes a user: a signed-in owner receives exactly what a stranger does, so what is public can be
 * reasoned about without asking who is looking. Every read re-checks that the evaluation is still published, not
 * trashed, ranked, in a project that is still public and live, and on a suite that is still public and in a live
 * project. A decision to publish is therefore never stronger than the state of everything it depends on, and a
 * withdrawal, a trashing or a privacy change removes a result from every list, count and detail at once.
 *
 * Fields are whitelisted by construction: each view below builds its output key by key. Commands, hostnames,
 * environment, raw config, signed URLs, run and user ids, and a Visin dataset's id or digest are never copied.
 */

/** Every published result is reported as the submitter's own claim: nothing here is independently verified. */
const EVIDENCE = 'submitter-reported';

const publicSuite = (suite: ISuite) => {
  const headline = suite.protocol.metrics.find((metric) => metric.headline)!;
  return {
    slug: suite.slug,
    version: suite.version,
    name: suite.name,
    ...(suite.description ? { description: suite.description } : {}),
    digest: suite.digest,
    ...(suite.archivedAt ? { archived: true } : {}),
    task: suite.protocol.task,
    split: suite.protocol.split,
    data: publicSuiteData(suite.protocol.data),
    conditions: suite.protocol.conditions.map((condition) => ({
      name: condition.name,
      sampleCount: condition.sampleCount
    })),
    headline: { key: headline.key, direction: headline.direction, ...(headline.unit ? { unit: headline.unit } : {}) },
    aggregation: suite.protocol.aggregation,
    evaluator: {
      package: suite.protocol.evaluator.package,
      ...(suite.protocol.evaluator.minVersion ? { minVersion: suite.protocol.evaluator.minVersion } : {})
    }
  };
};

interface Pool {
  rows: PoolRow[];
  projects: Map<string, { name: string; slug?: string }>;
}

/**
 * The rows of public boards: for each (suite, project, checkpoint), the latest ranked attempt, shown only when that
 * very attempt is published and every public gate still lets it through. The attempt is chosen among all of the
 * project's live attempts first, so the manager cannot publish the best of several and leave the rest unmentioned, and
 * `attempts` counts every one of them.
 */
async function publishedPool(suites: Map<string, ISuite>, onlySuiteId?: string, evidence?: 'observed'): Promise<Pool> {
  const projects = await Project.find({ visibility: 'public', trashedAt: null }).select('name slug').lean();
  const live = new Map(projects.map((project) => [project._id.toString(), { name: project.name, slug: project.slug }]));
  const rows = await leaderboardPool(
    {
      deletedAt: null,
      checkpointKey: { $exists: true },
      projectId: { $in: [...live.keys()] },
      'suite.id': { $in: onlySuiteId ? [onlySuiteId] : [...suites.keys()] }
    },
    { publishedOnly: true }
  );
  // The evidence filter is a view of the published rows, so it applies after the row has been chosen.
  return { rows: evidence ? rows.filter((row) => row.validation.evidence === evidence) : rows, projects: live };
}

/** The public suites whose own project is still live: a suite of a trashed project is not shown. */
async function publicSuites(ids?: string[]): Promise<Map<string, ISuite>> {
  const suites = await Suite.find({
    visibility: 'public',
    ...(ids ? { _id: { $in: ids.filter((id) => isValidObjectId(id)) } } : {})
  });
  const projectIds = [...new Set(suites.map((suite) => suite.projectId))].filter((id) => isValidObjectId(id));
  const live = new Set(
    (
      await Project.find({ _id: { $in: projectIds.map((id) => new Types.ObjectId(id)) }, trashedAt: null })
        .select('_id')
        .lean()
    ).map((project) => project._id.toString())
  );
  return new Map(suites.filter((suite) => live.has(suite.projectId)).map((suite) => [suite._id.toString(), suite]));
}

export const listPublicLeaderboards = (query: LeaderboardPageQuery = DEFAULT_LEADERBOARD_PAGE) =>
  cachedPublic(`list:${query.page}:${query.limit}`, () => buildPublicLeaderboards(query));

async function buildPublicLeaderboards(query: LeaderboardPageQuery) {
  const suites = await publicSuites();
  const { rows } = await publishedPool(suites);
  const bySuite = new Map<string, { checkpoints: Set<string>; lastPublishedAt: Date }>();
  for (const row of rows) {
    const held = bySuite.get(row.suite!.id) ?? { checkpoints: new Set<string>(), lastPublishedAt: row.lastPublishedAt };
    held.checkpoints.add(row.checkpointKey!);
    if (row.lastPublishedAt > held.lastPublishedAt) held.lastPublishedAt = row.lastPublishedAt;
    bySuite.set(row.suite!.id, held);
  }
  const leaderboards = [...bySuite.entries()]
    .map(([id, held]) => ({
      ...publicSuite(suites.get(id)!),
      checkpoints: held.checkpoints.size,
      lastPublishedAt: held.lastPublishedAt
    }))
    .sort(
      (a, b) =>
        b.lastPublishedAt.getTime() - a.lastPublishedAt.getTime() ||
        a.slug.localeCompare(b.slug) ||
        b.version - a.version
    );
  const page = leaderboardPage(leaderboards, query);
  return { leaderboards: page.rows, pagination: page.pagination };
}

/** The published, still-public results of one suite, ranked: the one place a public ranking is built. */
async function publicBoardOf(suite: ISuite, evidence?: 'observed') {
  const { rows, projects } = await publishedPool(new Map([[suite._id.toString(), suite]]), suite._id.toString(), evidence);
  const candidates: Candidate[] = rows.map((row) => ({
    id: row._id.toString(),
    attempts: row.attempts,
    checkpointKey: row.checkpointKey!,
    projectId: row.projectId,
    status: row.status,
    state: row.validation.state,
    scores: row.validation.scores,
    receivedAt: row.receivedAt
  }));
  return { rows, projects, board: buildLeaderboard(suite.protocol, candidates) };
}

export const getPublicLeaderboard = (slug: string, version: number, query: LeaderboardQuery = DEFAULT_LEADERBOARD_PAGE) =>
  cachedPublic(`board:${slug}:${version}:${query.page}:${query.limit}:${query.evidence ?? ''}`, () => buildPublicLeaderboard(slug, version, query));

async function buildPublicLeaderboard(slug: string, version: number, query: LeaderboardQuery) {
  const found = await Suite.findOne({ slug, version, visibility: 'public' });
  const suites = found ? await publicSuites([found._id.toString()]) : new Map<string, ISuite>();
  const suite = found && suites.get(found._id.toString());
  if (!suite) throw new NotFoundError('Leaderboard not found');

  const { rows, projects, board } = await publicBoardOf(suite, query.evidence);
  const byId = new Map(rows.map((row) => [row._id.toString(), row]));
  const page = leaderboardPage(board.entries, query);
  const headlineKey = suite.protocol.metrics.find((metric) => metric.headline)!.key;

  return {
    suite: publicSuite(suite),
    selection: board.selection,
    scope: { candidates: rows.reduce((count, row) => count + row.attempts, 0) },
    pagination: page.pagination,
    evidence: EVIDENCE,
    generatedAt: new Date(),
    entries: page.rows.map((entry) => {
      const row = byId.get(entry.evaluationId)!;
      return {
        rank: entry.rank,
        evaluationId: entry.evaluationId,
        checkpoint: publicCheckpoint(row.checkpoint),
        headline: entry.summary.headline.value,
        worst: entry.summary.worst,
        gap: entry.summary.gap,
        conditions: Object.fromEntries(
          Object.entries(row.validation.scores?.conditions ?? {}).flatMap(([name, values]) =>
            values[headlineKey] === undefined ? [] : [[name, values[headlineKey]]]
          )
        ),
        attempts: entry.attempts,
        evidenceLevel: row.validation.evidence ?? 'none',
        project: projects.get(row.projectId),
        ...(row.executedAt ? { executedAt: row.executedAt } : {}),
        publishedAt: row.publishedAt,
        ...(row.verifiedAt ? { verifiedAt: row.verifiedAt } : {})
      };
    })
  };
}

/** The evidence behind one public entry: its scores, samples, checkpoint and the evaluator, and nothing else. */
export const getPublicEvaluation = (id: string) => cachedPublic(`evaluation:${id}`, () => buildPublicEvaluation(id));

async function buildPublicEvaluation(id: string) {
  if (!isValidObjectId(id)) throw new NotFoundError('Evaluation not found');
  const row = await Evaluation.findOne({
    _id: id,
    publishedAt: { $ne: null },
    deletedAt: null,
    status: 'completed',
    'validation.state': 'eligible',
    checkpointKey: { $exists: true },
    supersededById: { $exists: false },
    hiddenAt: { $exists: false }
  }).select('suite checkpoint checkpointKey validation.scores validation.evidence sampleCounts provenance.evaluator projectId executedAt publishedAt verifiedAt');
  const suites = row?.suite ? await publicSuites([row.suite.id]) : new Map<string, ISuite>();
  const suite = row?.suite && suites.get(row.suite.id);
  if (!row || !suite || !isValidObjectId(row.projectId)) throw new NotFoundError('Evaluation not found');
  // A result that a newer ranked attempt has replaced on the board is not a public page any more.
  if ((await selectedAttemptId(row.projectId, row.suite!.id, row.checkpointKey!)) !== row._id.toString()) throw new NotFoundError('Evaluation not found');
  const project = await Project.findOne({ _id: row.projectId, visibility: 'public', trashedAt: null })
    .select('name slug')
    .lean();
  if (!project) throw new NotFoundError('Evaluation not found');

  const reported = (row.provenance?.evaluator ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.length <= 100 ? value : undefined);
  const evaluator = {
    ...(text(reported.package) ? { package: text(reported.package) } : {}),
    ...(text(reported.version) ? { version: text(reported.version) } : {}),
    ...(text(reported.commit) ? { commit: text(reported.commit) } : {})
  };
  return {
    evaluationId: row._id.toString(),
    suite: publicSuite(suite),
    checkpoint: publicCheckpoint(row.checkpoint),
    scores: row.validation.scores,
    ...(row.sampleCounts ? { sampleCounts: row.sampleCounts } : {}),
    ...(Object.keys(evaluator).length > 0 ? { evaluator } : {}),
    evidenceLevel: row.validation.evidence ?? 'none',
    project: { name: project.name, slug: project.slug },
    evidence: EVIDENCE,
    ...(row.executedAt ? { executedAt: row.executedAt } : {}),
    publishedAt: row.publishedAt,
    ...(row.verifiedAt ? { verifiedAt: row.verifiedAt } : {})
  };
}

export interface PublicStanding {
  suite: { slug: string; version: number; name: string };
  evaluationId: string;
  rank: number;
  /** how many rows are ranked on that suite */
  total: number;
  headline: { key: string; value: number; unit?: string };
}

/**
 * Where one checkpoint stands on every public leaderboard it is published to, as one project recorded it. Built from
 * the same public ranking as the leaderboard page, so a badge or a model card can never say more than the page does:
 * a checkpoint that is not published, or whose suite or project is no longer public, has no standing at all. Another
 * project's evaluation of the same checkpoint is another row and never answers for this one.
 */
export async function publicStandings(checkpointKey: string, projectId: string, only?: { slug: string; version: number }): Promise<PublicStanding[]> {
  const suiteIds = (await Evaluation.distinct('suite.id', {
    checkpointKey,
    projectId,
    publishedAt: { $ne: null },
    deletedAt: null,
    status: 'completed',
    'validation.state': 'eligible'
  })).filter((id): id is string => isValidObjectId(id));
  if (suiteIds.length === 0) return [];
  const suites = await publicSuites(suiteIds);
  const standings: PublicStanding[] = [];
  for (const suite of suites.values()) {
    if (only && (suite.slug !== only.slug || suite.version !== only.version)) continue;
    const { board } = await publicBoardOf(suite);
    const entry = board.entries.find((candidate) => candidate.checkpointKey === checkpointKey && candidate.projectId === projectId);
    if (!entry) continue;
    const { headline } = entry.summary;
    standings.push({
      suite: { slug: suite.slug, version: suite.version, name: suite.name },
      evaluationId: entry.evaluationId,
      rank: entry.rank,
      total: board.entries.length,
      headline: { key: headline.key, value: headline.value, ...(headline.unit ? { unit: headline.unit } : {}) }
    });
  }
  return standings.sort((a, b) => a.suite.slug.localeCompare(b.suite.slug) || b.suite.version - a.suite.version);
}

const figure = (value: number): string => String(Number(value.toPrecision(4)));

/**
 * The badge for one published checkpoint of one project on one suite version: "road-test v1 | mIoU 0.7351 · rank 2/9".
 * The project (an id or slug) is part of the address, because two projects can each publish the same checkpoint.
 */
export const getPublicBadge = (slug: string, version: number, checkpointKey: string, projectRef: string) =>
  cachedPublic(`badge:${slug}:${version}:${projectRef}:${checkpointKey}`, () => buildPublicBadge(slug, version, checkpointKey, projectRef));

async function buildPublicBadge(slug: string, version: number, checkpointKey: string, projectRef: string): Promise<string> {
  const project = await resolveProject(projectRef);
  if (!project) throw new NotFoundError('Badge not found');
  const [standing] = await publicStandings(checkpointKey, project._id.toString(), { slug, version });
  if (!standing) throw new NotFoundError('Badge not found');
  return renderBadge(
    `${standing.suite.slug} v${standing.suite.version}`,
    `${standing.headline.key} ${figure(standing.headline.value)} · rank ${standing.rank}/${standing.total}`
  );
}
