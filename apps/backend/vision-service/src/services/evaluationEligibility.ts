import type { Evidence } from '../validation/evaluationSchemas';
import type { SuiteProtocol } from '../validation/suiteSchemas';
import { compareVersions } from './evaluatorVersion';
import { dataMismatch } from './sourceRegistry';

/**
 * Whether a result can be ranked on a suite, and why not.
 *
 * - `eligible`: complete, in range, on this protocol; it may be ranked.
 * - `incomplete`: something the protocol requires is absent (a condition, a metric, a checkpoint). Fixable by
 *   sending the rest.
 * - `incompatible`: what was measured is not what the suite measures (another protocol, the wrong scale, other
 *   sample counts). Fixing it means evaluating again.
 * - `exploratory`: no suite; stored and inspectable, never ranked.
 * - `legacy-unverified`: recorded before suites existed; set by migration, never computed.
 */
export const VALIDATION_STATES = ['eligible', 'incomplete', 'incompatible', 'exploratory', 'legacy-unverified'] as const;
export type ValidationState = (typeof VALIDATION_STATES)[number];

/** `code` is stable and listed in the docs; `detail` names what it is about (`night`, `night/mIoU`). */
export interface ValidationReason {
  code: string;
  detail?: string;
}

export interface Scores {
  /** per condition, per declared metric */
  conditions: Record<string, Record<string, number>>;
  /** per declared metric, formed by the suite's aggregation */
  overall: Record<string, number>;
}

/**
 * How much the evaluator itself reported about what it ran, which never decides whether a result can be ranked,
 * only how it is labelled:
 * - `observed`: it sent the data, the protocol digest and its own package and version, and each matched the suite;
 * - `reported`: ranked on the submitter's word, with none or only some of that evidence (what was sent matched);
 * - `attested`: a manager vouched for an old result when promoting it, and nothing was observed;
 * - `none`: no suite, so nothing is ranked.
 * Every level is the submitter's word; none is verified.
 */
export type EvidenceLevel = 'observed' | 'reported' | 'attested' | 'none';

export interface ValidationReport {
  /** bumps when the rules change, so a stored report says which rules judged it */
  version: 2;
  state: ValidationState;
  evidence: EvidenceLevel;
  reasons: ValidationReason[];
  warnings: ValidationReason[];
  /** present when every score the suite needs could be read */
  scores?: Scores;
}

export interface EvaluationInput {
  status: 'completed' | 'failed';
  results: unknown;
  /** which bytes were scored; absent when the writer could not say */
  checkpointKey?: string;
  /** what the evaluator observed about its data, protocol, evaluator and classes */
  evidence?: Evidence;
  /** set for a promoted result: a manager vouches for it and nothing was observed to compare */
  attested?: boolean;
  /** how many samples each condition scored, as the evaluator observed */
  sampleCounts?: Record<string, number>;
}

/** Two scores closer than this are the same score: float sums must not break a tie or invent one. */
export const SCORE_EPSILON = 1e-9;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const report = (
  state: ValidationState,
  evidence: EvidenceLevel,
  reasons: ValidationReason[],
  warnings: ValidationReason[] = [],
  scores?: Scores
): ValidationReport => ({ version: 2, state, evidence, reasons, warnings, ...(scores ? { scores } : {}) });

/** The state of a result that is stored without a suite: kept, shown, never ranked. */
export const exploratoryReport = (): ValidationReport => report('exploratory', 'none', [{ code: 'no-suite' }]);

/** The same ids, whatever the order and however often one is repeated: a repeat never stands in for a missing id. */
const sameSet = (a: string[], b: string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every(id => right.has(id));
};

/** Whether the evaluator sent everything that makes a result `observed` rather than `reported`. */
const isObserved = (evidence: Evidence | undefined): boolean => Boolean(evidence?.data && evidence.protocolDigest && evidence.evaluator);

/**
 * Compare what the evaluator says it observed with what the suite pins. Evidence is optional: a missing item is a
 * warning (send it to be marked `observed`) and never stops a result being ranked. An item that was sent and
 * differs makes the result incompatible, since it then measured something else. Nothing here proves the evaluator
 * told the truth: it is a check that the claim, when made, is the right one.
 */
function judgeEvidence(
  protocol: SuiteProtocol,
  suiteDigest: string,
  evidence: Evidence | undefined,
  incompatible: ValidationReason[],
  warnings: ValidationReason[]
): void {
  if (!evidence?.data) warnings.push({ code: 'no-data-evidence' });
  else {
    const differs = dataMismatch(protocol.data, evidence.data);
    if (differs) incompatible.push({ code: 'data-mismatch', detail: differs });
  }

  if (!evidence?.protocolDigest) warnings.push({ code: 'no-protocol-evidence' });
  else if (evidence.protocolDigest !== suiteDigest) incompatible.push({ code: 'protocol-mismatch' });

  if (!evidence?.evaluator) warnings.push({ code: 'no-evaluator-evidence' });
  else {
    const { package: name, version } = evidence.evaluator;
    if (name !== protocol.evaluator.package) incompatible.push({ code: 'evaluator-mismatch', detail: name });
    else if (protocol.evaluator.minVersion !== undefined) {
      const order = compareVersions(version, protocol.evaluator.minVersion);
      if (order === undefined || order < 0) incompatible.push({ code: 'evaluator-unsupported', detail: `${name} ${version} < ${protocol.evaluator.minVersion}` });
    }
  }

  const declaredClasses = protocol.classes.map(item => item.id);
  if (!evidence?.classes) return;
  const ignored = new Set(protocol.ignoredClasses);
  if (declaredClasses.length > 0 && !sameSet(evidence.classes.scored, declaredClasses.filter(id => !ignored.has(id)))) {
    incompatible.push({ code: 'class-mismatch', detail: 'scored' });
  }
  if (!sameSet(evidence.classes.ignored, protocol.ignoredClasses)) incompatible.push({ code: 'class-mismatch', detail: 'ignored' });
}

/**
 * Judge one result against a suite's protocol, and read the scores the protocol asks for.
 *
 * Reads only the declared slices: `<condition>.overall.<metric>` for every declared condition and metric.
 * Anything else in the result is kept by the caller and ignored here. A missing slice is never a zero and
 * never averaged away: it makes the result incomplete.
 */
export function validateEvaluation(protocol: SuiteProtocol, suiteDigest: string, input: EvaluationInput): ValidationReport {
  const incompatible: ValidationReason[] = [];
  const incomplete: ValidationReason[] = [];
  const warnings: ValidationReason[] = [];

  const level: EvidenceLevel = input.attested ? 'attested' : isObserved(input.evidence) ? 'observed' : 'reported';
  if (input.status === 'failed') return report('incomplete', level, [{ code: 'evaluation-failed' }]);

  // A promoted result has nothing observed to compare, and none is invented from the suite it is promoted onto.
  if (!input.attested) judgeEvidence(protocol, suiteDigest, input.evidence, incompatible, warnings);
  if (!input.checkpointKey) incomplete.push({ code: 'no-checkpoint' });

  const results = isRecord(input.results) ? input.results : undefined;
  if (!results) return report('incomplete', level, [...incomplete, { code: 'results-not-an-object' }]);

  const conditions: Scores['conditions'] = {};
  for (const condition of protocol.conditions) {
    const block = results[condition.name];
    const overall = isRecord(block) && isRecord(block.overall) ? block.overall : undefined;
    if (!overall) {
      incomplete.push({ code: 'missing-condition', detail: condition.name });
      continue;
    }
    const row: Record<string, number> = {};
    for (const metric of protocol.metrics) {
      const value = overall[metric.key];
      if (!finite(value)) {
        incomplete.push({ code: 'missing-metric', detail: `${condition.name}/${metric.key}` });
      } else if (metric.range && (value < metric.range.min || value > metric.range.max)) {
        incompatible.push({ code: 'metric-out-of-range', detail: `${condition.name}/${metric.key}` });
      } else {
        row[metric.key] = value;
      }
    }
    conditions[condition.name] = row;

    const counted = input.sampleCounts?.[condition.name];
    if (counted === undefined) incomplete.push({ code: 'missing-sample-count', detail: condition.name });
    else if (counted !== condition.sampleCount) incompatible.push({ code: 'sample-count-mismatch', detail: condition.name });
  }

  const submitted = isRecord(results.overall) ? results.overall : {};
  const overall: Scores['overall'] = {};
  for (const metric of protocol.metrics) {
    const values = protocol.conditions.map(condition => conditions[condition.name]?.[metric.key]);
    if (protocol.aggregation === 'pooled') {
      const value = submitted[metric.key];
      if (finite(value) && (!metric.range || (value >= metric.range.min && value <= metric.range.max))) overall[metric.key] = value;
      else if (!finite(value)) incomplete.push({ code: 'missing-overall', detail: metric.key });
      else incompatible.push({ code: 'metric-out-of-range', detail: `overall/${metric.key}` });
      continue;
    }
    if (values.some(value => value === undefined)) continue; // already reported as a missing slice
    const weights = protocol.conditions.map(condition => (protocol.aggregation === 'sample-weighted-mean' ? condition.sampleCount : 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const computed = values.reduce<number>((sum, value, index) => sum + (value as number) * weights[index], 0) / total;
    overall[metric.key] = computed;
    const claimed = submitted[metric.key];
    if (finite(claimed) && Math.abs(claimed - computed) > 1e-6) {
      warnings.push({ code: 'submitted-overall-differs', detail: metric.key });
    }
  }

  const reasons = [...incompatible, ...incomplete];
  if (reasons.length === 0) return report('eligible', level, [], warnings, { conditions, overall });
  // Incompatible outranks incomplete: sending the missing slices would not make a different measurement comparable.
  return report(incompatible.length > 0 ? 'incompatible' : 'incomplete', level, reasons, warnings);
}
