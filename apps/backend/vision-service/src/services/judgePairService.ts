import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId, Types } from 'mongoose';
import Evaluation from '../models/Evaluation';
import Training from '../models/Training';
import JudgePair from '../models/JudgePair';
import JudgeDisagreement, { DISAGREEMENTS_VERSION, type DisagreementValue, type IJudgeDisagreement } from '../models/JudgeDisagreement';
import { getEvaluation } from './evaluationService';
import { checkProjectAccess } from './projectAccessService';
import { readableSuite } from './suiteService';
import { sampleDigest } from './sampleDigest';
import { evaluationScope, readerVisible } from './evaluationScope';
import { canonicalJson } from './suiteProtocol';
import { joinPair } from './sampleJoin';
import type { EvaluationView } from './evaluationView';

interface Cell {
  _id: { field: string; classId?: string; size?: string; role?: string; a: string; b: string; reference?: string };
  count: number;
  weight: number;
  mismatch: number;
}

interface Transition { a: string; b: string; count: number; weight: number }

/** Cohen's kappa for a transition table; undefined when chance agreement is exactly one. */
function kappa(matrix: Transition[]): number | null {
  const total = matrix.reduce((sum, row) => sum + row.count, 0);
  if (!total) return null;
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  let agreement = 0;
  for (const cell of matrix) {
    left.set(cell.a, (left.get(cell.a) ?? 0) + cell.count);
    right.set(cell.b, (right.get(cell.b) ?? 0) + cell.count);
    if (cell.a === cell.b) agreement += cell.count;
  }
  const expected = [...left].reduce((sum, [value, n]) => sum + n * (right.get(value) ?? 0), 0) / (total * total);
  return expected === 1 ? null : (agreement / total - expected) / (1 - expected);
}

export interface ResolvedPair {
  left: EvaluationView;
  suite: Awaited<ReturnType<typeof readableSuite>>;
  runA: string;
  runB: string;
  referenceRunId?: string;
  referenceEvaluationId?: string;
  cacheKey: { evaluationA: string; evaluationB: string; suiteId: string };
}

/**
 * Both evaluations, their completed runs and the suite's reference, each checked against the caller's access.
 * Done on every request, before any cache is read: neither a trashed run nor a private reference is exposed.
 */
export async function resolveJudgePair(a: string, b: string, userId?: string): Promise<ResolvedPair> {
  if (!isValidObjectId(a) || !isValidObjectId(b)) throw new NotFoundError('Evaluation not found');
  const [left, right] = await Promise.all([getEvaluation(a, userId), getEvaluation(b, userId)]);
  if (!left.suite || !right.suite || left.suite.id !== right.suite.id || left.suite.digest !== right.suite.digest || !left.samplesDigest || !right.samplesDigest || !left.source?.trainingId || !right.source?.trainingId) {
    throw new BadRequestError('Both evaluations must come from sample runs on the same suite');
  }
  const suite = await readableSuite(left.suite.slug, left.suite.version, userId);
  if (!suite.protocol.samples || suite.digest !== left.suite.digest) throw new BadRequestError('The sample suite is unavailable');
  const [runA, runB] = await Promise.all([
    Training.findOne({ _id: left.source.trainingId, projectId: left.projectId, deletedAt: null, status: 'completed' }),
    Training.findOne({ _id: right.source.trainingId, projectId: right.projectId, deletedAt: null, status: 'completed' })
  ]);
  if (!runA || !runB || !(await checkProjectAccess(userId, runA.projectId)) || !(await checkProjectAccess(userId, runB.projectId))) throw new NotFoundError('Run not found');
  let referenceRunId: string | undefined;
  let referenceEvaluationId: string | undefined;
  if (suite.protocol.reference) {
    const scope = await evaluationScope(userId);
    const reference = await Evaluation.findOne({
      'suite.id': left.suite.id, 'checkpoint.kind': 'human', samplesDigest: suite.protocol.reference.samplesDigest, status: 'completed', deletedAt: null,
      $or: [{ projectId: { $in: scope.full } }, { projectId: { $in: scope.published }, ...readerVisible }]
    });
    if (!reference?.source?.trainingId) throw new ConflictError('The suite reference evaluation is unavailable');
    referenceEvaluationId = reference._id.toString();
    await getEvaluation(reference._id.toString(), userId);
    const run = await Training.findOne({ _id: reference.source.trainingId, projectId: reference.projectId, deletedAt: null, status: 'completed' });
    if (!run || !(await checkProjectAccess(userId, run.projectId))) throw new NotFoundError('Reference run not found');
    referenceRunId = run._id.toString();
  }
  return {
    left, suite, runA: runA._id.toString(), runB: runB._id.toString(), referenceRunId, referenceEvaluationId,
    cacheKey: { evaluationA: a, evaluationB: b, suiteId: left.suite.id }
  };
}

/**
 * The human reference a sample evaluation is measured against: the suite's reference evaluation, as the caller may
 * read it. Not found for an evaluation on a suite without one, or one the caller cannot see.
 */
export async function referenceEvaluation(id: string, userId?: string): Promise<EvaluationView> {
  if (!isValidObjectId(id)) throw new NotFoundError('Evaluation not found');
  const evaluation = await getEvaluation(id, userId);
  if (!evaluation.suite || !evaluation.samplesDigest) throw new NotFoundError('This evaluation has no sample reference');
  const suite = await readableSuite(evaluation.suite.slug, evaluation.suite.version, userId);
  if (!suite.protocol.reference) throw new NotFoundError('This suite has no reference');
  const scope = await evaluationScope(userId);
  const reference = await Evaluation.findOne({
    'suite.id': evaluation.suite.id, 'checkpoint.kind': 'human', samplesDigest: suite.protocol.reference.samplesDigest, status: 'completed', deletedAt: null,
    $or: [{ projectId: { $in: scope.full } }, { projectId: { $in: scope.published }, ...readerVisible }]
  }).select('_id');
  if (!reference) throw new NotFoundError('The suite reference evaluation is unavailable');
  return getEvaluation(reference._id.toString(), userId);
}

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
/** Equal as the stored attributes compare: a missing value equals another missing one; only lists need serialising. */
const sameValue = (x: unknown, y: unknown) => {
  if (x === y || ((x === undefined || x === null) && (y === undefined || y === null))) return true;
  if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false;
  return canonicalJson(x) === canonicalJson(y);
};
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** Rows written per insert while a pair is analysed. */
const BUILD_BATCH = 1000;

/** Insert a batch of disagreement rows; rows already stored (a resumed or concurrent build) are skipped. */
async function insertDisagreements(rows: IJudgeDisagreement[]): Promise<void> {
  if (!rows.length) return;
  try {
    await JudgeDisagreement.insertMany(rows, { ordered: false });
  } catch (error) {
    const failure = error as { code?: number; writeErrors?: { code?: number; err?: { code?: number } }[] };
    const codes = failure.writeErrors?.map(item => item.code ?? item.err?.code) ?? [failure.code];
    if (codes.some(code => code !== 11000)) throw error;
  }
}

/**
 * One pass over the samples the two runs share (see `joinPair`): the pair's transition counts by field, class, size
 * and role (and the reference's value, for fields that say which values accept), and, given the pair's id, its
 * disagreement rows, written as the pass goes. Fields the other run left without a value do not count. Any matched
 * sample whose attributes differ between the runs is refused.
 */
async function analysePair(pair: ResolvedPair, pairId?: string): Promise<Cell[]> {
  const samples = pair.suite.protocol.samples!;
  const declaredKeys = samples.fields.map(field => field.key);
  const declared = new Set(declaredKeys);
  const judged = new Set(samples.fields.filter(field => field.accept).map(field => field.key));
  const cells = new Map<string, Cell>();
  let batch: IJudgeDisagreement[] = [];
  for await (const { a: row, b: other, extra: reference } of joinPair(pair.runA, pair.runB, pair.referenceRunId)) {
    const attrs = recordOf(row.attrs);
    const otherAttrs = recordOf(other.attrs);
    // A reference that is one of the two runs was compared already.
    const referenceAttrs = reference && reference !== row && reference !== other ? recordOf(reference.attrs) : undefined;
    const differs = samples.attrs.some(attr => !sameValue(attrs[attr.key], otherAttrs[attr.key]))
      || Boolean(referenceAttrs && samples.attrs.some(attr => !sameValue(attrs[attr.key], referenceAttrs[attr.key])));
    const weight = samples.weight ? Number(attrs[samples.weight] ?? 0) : 1;
    const fields = recordOf(row.fields);
    const otherFields = recordOf(other.fields);
    const referenceFields = reference ? recordOf(reference.fields) : {};
    for (const [field, value] of Object.entries(fields)) {
      const otherValue = otherFields[field];
      if (!declared.has(field) || typeof otherValue !== 'string') continue;
      const referenceValue = pair.referenceRunId && judged.has(field) ? (referenceFields[field] ?? null) as string | null : null;
      const id = { field, classId: text(attrs.class), size: text(attrs.size), role: text(attrs.role), a: value as string, b: otherValue, reference: referenceValue ?? undefined };
      const key = JSON.stringify([field, id.classId ?? null, id.size ?? null, id.role ?? null, id.a, id.b, referenceValue]);
      const cell = cells.get(key) ?? { _id: id, count: 0, weight: 0, mismatch: 0 };
      cell.count += 1;
      cell.weight += weight;
      if (differs) cell.mismatch += 1;
      cells.set(key, cell);
    }
    if (pairId === undefined) continue;
    const values: DisagreementValue[] = [];
    for (const field of declaredKeys) {
      const a = fields[field];
      const b = otherFields[field];
      if (a === undefined || a === null || b === undefined || b === null || a === b) continue;
      values.push({ field, a: String(a), b: String(b), ...(reference && typeof referenceFields[field] === 'string' ? { reference: referenceFields[field] as string } : {}) });
    }
    if (!values.length) continue;
    batch.push({
      pair: pairId, sampleId: row.sampleId, values,
      ...(text(attrs.class) ? { class: text(attrs.class) } : {}),
      ...(text(attrs.size) ? { size: text(attrs.size) } : {}),
      ...(text(attrs.role) ? { role: text(attrs.role) } : {})
    });
    if (batch.length >= BUILD_BATCH) {
      await insertDisagreements(batch);
      batch = [];
    }
  }
  if (pairId !== undefined) await insertDisagreements(batch);
  return [...cells.values()];
}

/** Compare two judges. The result is cached per pair; access is resolved again on every request. */
export async function compareJudgePair(a: string, b: string, userId?: string) {
  const pair = await resolveJudgePair(a, b, userId);
  const { suite, referenceRunId, referenceEvaluationId, cacheKey } = pair;
  const cached = await JudgePair.findOne(cacheKey).lean();
  if (cached) return { ...cached.results, ...(referenceEvaluationId ? { referenceEvaluationId } : {}) };
  if (referenceRunId && await sampleDigest(referenceRunId) !== suite.protocol.reference!.samplesDigest) throw new ConflictError('Reference samples do not match the suite digest');
  const samples = suite.protocol.samples!;

  // The pair's id is chosen first, so its disagreements are stored in the same pass that counts them.
  const pairId = new Types.ObjectId();
  let cells: Cell[];
  try {
    cells = await analysePair(pair, String(pairId));
  } catch (error) {
    await JudgeDisagreement.deleteMany({ pair: String(pairId) });
    throw error;
  }

  if (cells.some(cell => cell.mismatch)) throw new BadRequestError('Matching sample ids have different attributes');
  const fields = samples.fields.map(field => {
    const byScope = new Map<string, { transitions: Map<string, Transition>; reference: { total: number; errorA: number; errorB: number; flips: number; correctA: number; correctB: number; keepUnlessBothDeleteErrors: number; reviewedErrors: number } }>();
    for (const cell of cells.filter(row => row._id.field === field.key)) {
      const scopes: [string, string | undefined][] = [['overall', undefined], ['class', cell._id.classId], ['size', cell._id.size], ['role', cell._id.role]];
      for (const [groupBy, value] of scopes) {
        if (groupBy !== 'overall' && value == null) continue;
        const key = JSON.stringify([groupBy, value ?? null]);
        const group = byScope.get(key) ?? { transitions: new Map<string, Transition>(), reference: { total: 0, errorA: 0, errorB: 0, flips: 0, correctA: 0, correctB: 0, keepUnlessBothDeleteErrors: 0, reviewedErrors: 0 } };
        const transitionKey = JSON.stringify([cell._id.a, cell._id.b]);
        const transition = group.transitions.get(transitionKey) ?? { a: cell._id.a, b: cell._id.b, count: 0, weight: 0 };
        transition.count += cell.count;
        transition.weight += cell.weight;
        group.transitions.set(transitionKey, transition);
        if (field.accept && cell._id.reference != null) {
          const aKeep = field.accept.includes(cell._id.a), bKeep = field.accept.includes(cell._id.b), humanKeep = field.accept.includes(cell._id.reference);
          const ref = group.reference, n = cell.count;
          ref.total += n;
          if (aKeep !== humanKeep) ref.errorA += n;
          if (bKeep !== humanKeep) ref.errorB += n;
          if (aKeep !== bKeep) {
            ref.flips += n;
            if (aKeep === humanKeep) ref.correctA += n;
            if (bKeep === humanKeep) ref.correctB += n;
          }
          if ((aKeep || bKeep) !== humanKeep) ref.keepUnlessBothDeleteErrors += n;
          if (aKeep === bKeep && aKeep !== humanKeep) ref.reviewedErrors += n;
        }
        byScope.set(key, group);
      }
    }
    const groups = [...byScope].map(([key, group]) => {
      const [groupBy, value] = JSON.parse(key) as [string, string | null];
      const matrix = [...group.transitions.values()].sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
      const count = matrix.reduce((sum, cell) => sum + cell.count, 0);
      const agreed = matrix.filter(cell => cell.a === cell.b).reduce((sum, cell) => sum + cell.count, 0);
      const weight = matrix.reduce((sum, cell) => sum + cell.weight, 0);
      const agreedWeight = matrix.filter(cell => cell.a === cell.b).reduce((sum, cell) => sum + cell.weight, 0);
      const binary = field.accept && matrix.map(cell => ({ ...cell, a: String(field.accept!.includes(cell.a)), b: String(field.accept!.includes(cell.b)) }));
      const ref = group.reference;
      const reference = ref.total ? {
        ...ref,
        errorRateA: ref.errorA / ref.total,
        errorRateB: ref.errorB / ref.total,
        keepUnlessBothDeleteErrorRate: ref.keepUnlessBothDeleteErrors / ref.total,
        reviewedErrorRate: ref.reviewedErrors / ref.total
      } : undefined;
      return { groupBy, ...(value === null ? {} : { value }), count, agreement: agreed / count, divergence: 1 - agreed / count, kappa: kappa(matrix), ...(binary ? { binaryKappa: kappa(binary) } : {}), weightedDivergence: weight ? 1 - agreedWeight / weight : null, matrix, ...(reference ? { reference } : {}) };
    });
    return { field: field.key, groups };
  });
  const results = { evaluationA: a, evaluationB: b, suite: { slug: suite.slug, version: suite.version, digest: suite.digest }, fields };
  // Two first comparisons of a pair may finish together: an upsert keeps one (MongoDB retries the loser itself), and
  // the loser's rows are removed, as the stored pair's own stand.
  const stored = await JudgePair.updateOne(cacheKey, {
    $setOnInsert: {
      _id: pairId, ...cacheKey, ...(referenceEvaluationId ? { referenceEvaluationId } : {}), results,
      disagreementsReady: true, disagreementsVersion: DISAGREEMENTS_VERSION
    }
  }, { upsert: true });
  if (!stored.upsertedCount) await JudgeDisagreement.deleteMany({ pair: String(pairId) });
  return { ...results, ...(referenceEvaluationId ? { referenceEvaluationId } : {}) };
}


/** Builds in progress on this instance, so a second request for the same pair waits for the first instead of repeating it. */
const building = new Map<string, Promise<void>>();

/** Store the pair's disagreements unless a build of them is already running here; resolves when they are stored. */
export function ensureJudgeDisagreements(pair: ResolvedPair, pairId: string): Promise<void> {
  let job = building.get(pairId);
  if (!job) {
    job = buildJudgeDisagreements(pair, pairId).finally(() => building.delete(pairId));
    building.set(pairId, job);
  }
  return job;
}

/**
 * Store every disagreement of the pair, one row per sample and field on which both judges gave a value and the values
 * differ, in one ordered pass. Rows already there are skipped, so a rebuild after an interruption, or two at once,
 * converge on the same set. Marks the pair ready only when the pass finished.
 */
export async function buildJudgeDisagreements(pair: ResolvedPair, pairId: string): Promise<void> {
  // Rows of an older shape, or of an interrupted build of one, are cleared first; a build of this shape resumes.
  const stored = await JudgePair.findById(pairId).select('disagreementsVersion').lean();
  if (stored?.disagreementsVersion !== DISAGREEMENTS_VERSION) {
    await JudgeDisagreement.deleteMany({ pair: pairId });
    await JudgePair.updateOne({ _id: pairId }, { $set: { disagreementsVersion: DISAGREEMENTS_VERSION, disagreementsReady: false } });
  }
  await analysePair(pair, pairId);
  await JudgePair.updateOne({ _id: pairId }, { $set: { disagreementsReady: true } });
}
