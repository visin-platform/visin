import type { SuiteProtocol } from '../validation/suiteSchemas';
import { SCORE_EPSILON, type Scores, type ValidationState } from './evaluationEligibility';

/** What selection and ranking need to know about one stored evaluation. */
export interface Candidate {
  id: string;
  /** Total attempts when the database has already selected one representative. */
  attempts?: number;
  checkpointKey: string;
  /** the project that recorded it: two projects' evaluations of one checkpoint are two rows, never one */
  projectId?: string;
  status: 'completed' | 'failed';
  state: ValidationState;
  scores?: Scores;
  /** set by the server on arrival; never the writer's clock */
  receivedAt: Date;
}

export interface Summary {
  headline: { key: string; value: number; direction: 'max' | 'min'; unit?: string };
  /** the condition the headline is worst on: lowest for `max`, highest for `min` */
  worst: { condition: string; value: number };
  /** how far the worst condition falls short of the overall figure; never negative */
  gap: number;
}

export interface RankedEntry {
  evaluationId: string;
  checkpointKey: string;
  projectId?: string;
  rank: number;
  /** how many evaluations of this checkpoint were received, of any outcome */
  attempts: number;
  summary: Summary;
}

export interface Leaderboard {
  /** ranked entries, best first by score, then evaluation id; ties share a rank */
  entries: RankedEntry[];
  /** checkpoints with attempts but none eligible, with their latest attempt's state, so nothing vanishes silently */
  unranked: { checkpointKey: string; projectId?: string; evaluationId: string; state: ValidationState; attempts: number }[];
  selection: 'latest-eligible-completed';
}

/** What one row stands for: a checkpoint as one project recorded it. Results from other projects are other rows. */
const rowOf = (candidate: Pick<Candidate, 'checkpointKey' | 'projectId'>): string => `${candidate.projectId ?? ''}\u0000${candidate.checkpointKey}`;

const headlineMetric = (protocol: SuiteProtocol) => protocol.metrics.find(metric => metric.headline)!;

/** The headline, worst condition and gap of a set of scores. Missing slices never reach here: a result without them is not eligible. */
export function summarize(protocol: SuiteProtocol, scores: Scores): Summary | undefined {
  const metric = headlineMetric(protocol);
  const overall = scores.overall[metric.key];
  if (overall === undefined) return undefined;
  const values = protocol.conditions.flatMap(condition => {
    const value = scores.conditions[condition.name]?.[metric.key];
    return value === undefined ? [] : [{ condition: condition.name, value }];
  });
  if (values.length !== protocol.conditions.length) return undefined;
  const worst = values.reduce((held, next) => (metric.direction === 'max' ? (next.value < held.value ? next : held) : next.value > held.value ? next : held));
  // `pooled` overall is not the mean of its conditions, so the gap can come out on the wrong side of zero: cap it.
  const gap = Math.max(0, metric.direction === 'max' ? overall - worst.value : worst.value - overall);
  return {
    headline: { key: metric.key, value: overall, direction: metric.direction, ...(metric.unit ? { unit: metric.unit } : {}) },
    worst,
    gap
  };
}

const newestFirst = (a: Candidate, b: Candidate) =>
  b.receivedAt.getTime() - a.receivedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One evaluation per checkpoint and project: the latest eligible completed one, by arrival time and then id. Never the best
 * repeat, which would let a checkpoint be run until it looks good. Attempts that are not selected stay in the
 * database and are counted, not hidden.
 */
export function selectEvaluations(candidates: Candidate[]): Map<string, Candidate> {
  const chosen = new Map<string, Candidate>();
  for (const candidate of [...candidates].sort(newestFirst)) {
    if (candidate.status !== 'completed' || candidate.state !== 'eligible' || !candidate.scores) continue;
    if (!chosen.has(rowOf(candidate))) chosen.set(rowOf(candidate), candidate);
  }
  return chosen;
}

/**
 * Rank the candidates of one suite version. Direction comes from the suite alone. Headlines within
 * `SCORE_EPSILON` of the best score in a group share its rank and the next rank skips ("1, 2, 2, 4"); the id only
 * orders rows with exactly equal scores.
 */
export function buildLeaderboard(protocol: SuiteProtocol, candidates: Candidate[]): Leaderboard {
  const chosen = selectEvaluations(candidates);
  const attempts = new Map<string, number>();
  for (const candidate of candidates) attempts.set(rowOf(candidate), (attempts.get(rowOf(candidate)) ?? 0) + (candidate.attempts ?? 1));

  const direction = headlineMetric(protocol).direction;
  const rows = [...chosen.values()].flatMap(candidate => {
    const summary = summarize(protocol, candidate.scores!);
    return summary ? [{ candidate, summary }] : [];
  });
  // Order by score alone (exactly), then id. A tie group is every row within the epsilon of the group's first
  // (best) row, so it is a function of the sorted values: pairwise epsilon comparison is not transitive, and
  // chaining it would tie endpoints farther apart than the epsilon.
  const value = (row: (typeof rows)[number]) => row.summary.headline.value;
  rows.sort((a, b) => (direction === 'max' ? value(b) - value(a) : value(a) - value(b)) || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0));

  const entries: RankedEntry[] = [];
  let leader: { value: number; rank: number } | undefined;
  rows.forEach((row, index) => {
    if (!leader || Math.abs(leader.value - value(row)) > SCORE_EPSILON) leader = { value: value(row), rank: index + 1 };
    entries.push({
      evaluationId: row.candidate.id,
      checkpointKey: row.candidate.checkpointKey,
      ...(row.candidate.projectId ? { projectId: row.candidate.projectId } : {}),
      rank: leader.rank,
      attempts: attempts.get(rowOf(row.candidate)) ?? 1,
      summary: row.summary
    });
  });

  const ranked = new Set(entries.map(entry => rowOf(entry)));
  const latestByRow = new Map<string, Candidate>();
  for (const candidate of [...candidates].sort(newestFirst)) {
    if (!ranked.has(rowOf(candidate)) && !latestByRow.has(rowOf(candidate))) latestByRow.set(rowOf(candidate), candidate);
  }
  const unranked = [...latestByRow.values()].map(candidate => ({
    checkpointKey: candidate.checkpointKey,
    ...(candidate.projectId ? { projectId: candidate.projectId } : {}),
    evaluationId: candidate.id,
    state: candidate.state,
    attempts: attempts.get(rowOf(candidate)) ?? 1
  }));

  return { entries, unranked, selection: 'latest-eligible-completed' };
}
