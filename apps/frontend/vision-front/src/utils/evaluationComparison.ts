import type { Evaluation, Suite } from '../types/evaluation';

/**
 * Two evaluations of one suite version, score by score, in each metric's own direction: the overall figure and every
 * condition the suite declares. The scores are the ones the server projected for ranking, so what is compared here
 * is what the ranking compared. A condition one side has no score in is shown as missing, never as a zero, and a
 * different suite version or protocol is refused, since it is a different measurement.
 */
export const OVERALL = 'overall';
const TOLERANCE = 1e-9;

export type ScoreVerdict = 'better' | 'worse' | 'same' | 'missing';

export interface ComparedScore {
  /** a condition name, or `overall` */
  scope: string;
  baseline?: number;
  candidate?: number;
  /** candidate minus baseline, as numbers */
  delta?: number;
  /** positive when the candidate is better in the metric's direction */
  improvement?: number;
  verdict: ScoreVerdict;
}

export interface EvaluationComparison {
  suite: string;
  metric: { key: string; direction: 'max' | 'min'; unit?: string };
  rows: ComparedScore[];
  /** which conditions the suite declares and which each side has a score in */
  coverage: { declared: string[]; baseline: string[]; candidate: string[] };
  /** what stops a side being compared at all, such as not being ranked */
  problems: string[];
}

export class NotComparable extends Error {}

const ref = (suite: Pick<Suite, 'slug' | 'version'>) => `${suite.slug}@${suite.version}`;

const scoreOf = (evaluation: Evaluation, scope: string, metric: string): number | undefined => {
  const scores = evaluation.validation.state === 'eligible' ? evaluation.validation.scores : undefined;
  const block = scope === OVERALL ? scores?.overall : scores?.conditions[scope];
  const value = block?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

/** The metrics a suite names, the headline first. */
export const suiteMetrics = (suite: Suite): Suite['protocol']['metrics'] =>
  [...suite.protocol.metrics].sort((a, b) => Number(Boolean(b.headline)) - Number(Boolean(a.headline)));

export function compareEvaluations(suite: Suite, baseline: Evaluation, candidate: Evaluation, metricKey?: string): EvaluationComparison {
  for (const [label, evaluation] of [['first', baseline], ['second', candidate]] as const) {
    if (!evaluation.suite || evaluation.suite.slug !== suite.slug || evaluation.suite.version !== suite.version) {
      const where = evaluation.suite ? ref(evaluation.suite) : 'no suite';
      throw new NotComparable(`The ${label} checkpoint is on ${where}, not ${ref(suite)}: only one suite version can be compared.`);
    }
    if (evaluation.suite.digest !== suite.digest) {
      throw new NotComparable(`The ${label} checkpoint was judged on a different protocol than ${ref(suite)} has now.`);
    }
  }
  const metric = suiteMetrics(suite).find(item => (metricKey ? item.key === metricKey : item.headline)) ?? suiteMetrics(suite)[0];
  if (!metric) throw new NotComparable(`${ref(suite)} names no metric to compare.`);

  const declared = suite.protocol.conditions.map(condition => condition.name);
  const rows = [OVERALL, ...declared].map((scope): ComparedScore => {
    const before = scoreOf(baseline, scope, metric.key);
    const after = scoreOf(candidate, scope, metric.key);
    if (before === undefined || after === undefined) return { scope, baseline: before, candidate: after, verdict: 'missing' };
    const improvement = metric.direction === 'max' ? after - before : before - after;
    return {
      scope,
      baseline: before,
      candidate: after,
      delta: after - before,
      improvement,
      verdict: improvement > TOLERANCE ? 'better' : improvement < -TOLERANCE ? 'worse' : 'same'
    };
  });
  const present = (evaluation: Evaluation) => declared.filter(scope => scoreOf(evaluation, scope, metric.key) !== undefined);
  const problems = ([['first', baseline], ['second', candidate]] as const)
    .filter(([, evaluation]) => evaluation.validation.state !== 'eligible' || !evaluation.validation.scores)
    .map(([label, evaluation]) => `The ${label} checkpoint is ${evaluation.validation.state}, so it has no ranked scores to compare.`);
  return {
    suite: ref(suite),
    metric: { key: metric.key, direction: metric.direction, ...(metric.unit ? { unit: metric.unit } : {}) },
    rows,
    coverage: { declared, baseline: present(baseline), candidate: present(candidate) },
    problems
  };
}
