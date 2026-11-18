import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import Evaluation from '../models/Evaluation';
import Training from '../models/Training';
import JudgePair from '../models/JudgePair';
import JudgeDisagreement from '../models/JudgeDisagreement';
import { getEvaluation } from './evaluationService';
import { checkProjectAccess } from './projectAccessService';
import { readableSuite } from './suiteService';
import { sampleDigest } from './sampleDigest';
import { evaluationScope, readerVisible } from './evaluationScope';
import { canonicalJson } from './suiteProtocol';
import { joinRuns } from './sampleJoin';
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

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const sameValue = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/**
 * The pair's transition counts by field, class, size and role (and the reference's value, for fields that say which
 * values accept), from one ordered pass over both runs and the reference. Samples one run lacks, and fields the other
 * left without a value, do not count. Any matched sample whose attributes differ between the runs is refused.
 */
async function pairCells(pair: ResolvedPair): Promise<Cell[]> {
  const samples = pair.suite.protocol.samples!;
  const declared = new Set(samples.fields.map(field => field.key));
  const judged = new Set(samples.fields.filter(field => field.accept).map(field => field.key));
  const cells = new Map<string, Cell>();
  for await (const { row, others: [other, reference] } of joinRuns(pair.runA, [pair.runB, pair.referenceRunId])) {
    if (!other) continue;
    const attrs = recordOf(row.attrs);
    const otherAttrs = recordOf(other.attrs);
    const referenceAttrs = reference ? recordOf(reference.attrs) : undefined;
    const differs = samples.attrs.some(attr => !sameValue(attrs[attr.key], otherAttrs[attr.key]))
      || Boolean(referenceAttrs && samples.attrs.some(attr => !sameValue(attrs[attr.key], referenceAttrs[attr.key])));
    const weight = samples.weight ? Number(attrs[samples.weight] ?? 0) : 1;
    const otherFields = recordOf(other.fields);
    const referenceFields = reference ? recordOf(reference.fields) : {};
    for (const [field, value] of Object.entries(recordOf(row.fields))) {
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
  }
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

  const cells = await pairCells(pair);

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
  // Two first comparisons of a pair may finish together: an upsert keeps one, and MongoDB retries the loser itself.
  await JudgePair.updateOne(cacheKey, { $setOnInsert: { ...cacheKey, ...(referenceEvaluationId ? { referenceEvaluationId } : {}), results } }, { upsert: true });
  return { ...results, ...(referenceEvaluationId ? { referenceEvaluationId } : {}) };
}

const BUILD_BATCH = 1000;

/**
 * Store every disagreement of the pair, one row per sample and field on which both judges gave a value and the values
 * differ, in one ordered pass. Rows already there are skipped, so a rebuild after an interruption, or two at once,
 * converge on the same set. Marks the pair ready only when the pass finished.
 */
export async function buildJudgeDisagreements(pair: ResolvedPair, pairId: string): Promise<void> {
  const declared = pair.suite.protocol.samples!.fields.map(field => field.key);
  let batch: Record<string, unknown>[] = [];
  const flush = async () => {
    if (!batch.length) return;
    try {
      await JudgeDisagreement.insertMany(batch, { ordered: false });
    } catch (error) {
      const failure = error as { code?: number; writeErrors?: { code?: number; err?: { code?: number } }[] };
      const codes = failure.writeErrors?.map(item => item.code ?? item.err?.code) ?? [failure.code];
      if (codes.some(code => code !== 11000)) throw error;
    }
    batch = [];
  };
  for await (const { row, others: [other, reference] } of joinRuns(pair.runA, [pair.runB, pair.referenceRunId])) {
    if (!other) continue;
    const attrs = recordOf(row.attrs);
    const fields = recordOf(row.fields);
    const otherFields = recordOf(other.fields);
    const referenceFields = reference ? recordOf(reference.fields) : undefined;
    let sample: Record<string, unknown> | undefined;
    for (const field of declared) {
      const a = fields[field];
      const b = otherFields[field];
      if (a === undefined || a === null || b === undefined || b === null || a === b) continue;
      sample ??= {
        id: row.sampleId,
        attrs,
        a: { fields, ...(row.raw !== undefined ? { raw: row.raw } : {}) },
        b: { fields: otherFields, ...(other.raw !== undefined ? { raw: other.raw } : {}) },
        ...(referenceFields ? { reference: { fields: referenceFields } } : {})
      };
      batch.push({
        pair: pairId, field, sampleId: row.sampleId,
        ...(text(attrs.class) ? { class: text(attrs.class) } : {}),
        ...(text(attrs.size) ? { size: text(attrs.size) } : {}),
        ...(text(attrs.role) ? { role: text(attrs.role) } : {}),
        a: String(a), b: String(b),
        ...(referenceFields && typeof referenceFields[field] === 'string' ? { reference: referenceFields[field] } : {}),
        sample
      });
      if (batch.length >= BUILD_BATCH) await flush();
    }
  }
  await flush();
  await JudgePair.updateOne({ _id: pairId }, { $set: { disagreementsReady: true } });
}
