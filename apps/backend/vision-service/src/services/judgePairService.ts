import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId, type PipelineStage } from 'mongoose';
import Evaluation from '../models/Evaluation';
import Training from '../models/Training';
import RunSample from '../models/RunSample';
import JudgePair from '../models/JudgePair';
import { getEvaluation } from './evaluationService';
import { checkProjectAccess } from './projectAccessService';
import { readableSuite } from './suiteService';
import { sampleDigest } from './sampleDigest';
import { evaluationScope, readerVisible } from './evaluationScope';

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

const getField = (name: string, input: string) => ({ $getField: { field: { $literal: name }, input } });

/** Access is rechecked before the cache is consulted: neither a trashed run nor a private reference is exposed. */
export async function compareJudgePair(a: string, b: string, userId?: string) {
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
  const cacheKey = { evaluationA: a, evaluationB: b, suiteId: left.suite.id };
  const cached = await JudgePair.findOne(cacheKey).lean();
  if (cached) return { ...cached.results, ...(referenceEvaluationId ? { referenceEvaluationId } : {}) };
  if (referenceRunId && await sampleDigest(referenceRunId) !== suite.protocol.reference!.samplesDigest) throw new ConflictError('Reference samples do not match the suite digest');

  const attrMismatch = suite.protocol.samples.attrs.map(attr => ({ $ne: [
    { $ifNull: [getField(attr.key, '$attrs'), null] },
    { $ifNull: [getField(attr.key, '$other.attrs'), null] }
  ] }));
  const referenceMismatch = suite.protocol.samples.attrs.map(attr => ({ $ne: [
    { $ifNull: [getField(attr.key, '$attrs'), null] },
    { $ifNull: [getField(attr.key, '$reference.attrs'), null] }
  ] }));
  // The reference's value of the same field, for each field that says which values accept; `$getField` needs a
  // constant name, so the field is chosen by a switch over the protocol's own keys.
  const judged = suite.protocol.samples.fields.filter(field => field.accept);
  const referenceValue = referenceRunId && judged.length
    ? { $switch: { branches: judged.map(field => ({ case: { $eq: ['$entries.k', field.key] }, then: { $ifNull: [getField(field.key, '$reference.fields'), null] } })), default: null } }
    : null;
  const lookup = (trainingId: string, as: string) => ({ $lookup: {
    from: RunSample.collection.name,
    let: { sample: '$sampleId' },
    pipeline: [{ $match: { trainingId, $expr: { $eq: ['$sampleId', '$$sample'] } } }, { $project: { fields: 1, attrs: 1 } }],
    as
  } });
  const stages: Record<string, unknown>[] = [
    { $match: { trainingId: runA._id.toString() } },
    lookup(runB._id.toString(), 'otherRows'),
    { $unwind: '$otherRows' },
    { $set: { other: '$otherRows', entries: { $objectToArray: '$fields' } } },
    ...(referenceRunId ? [lookup(referenceRunId, 'referenceRows'), { $set: { reference: { $arrayElemAt: ['$referenceRows', 0] } } }] : []),
    { $unwind: '$entries' },
    { $match: { 'entries.k': { $in: suite.protocol.samples.fields.map(field => field.key) } } },
    { $set: {
      otherValue: { $getField: { field: '$entries.k', input: '$other.fields' } },
      attrsDiffer: { $or: [
        ...(attrMismatch.length ? attrMismatch : [false]),
        ...(referenceRunId ? [{ $and: [{ $ne: [{ $ifNull: ['$reference', null] }, null] }, { $or: referenceMismatch.length ? referenceMismatch : [false] }] }] : [])
      ] },
      sampleWeight: suite.protocol.samples.weight ? { $ifNull: [getField(suite.protocol.samples.weight, '$attrs'), 0] } : 1
    } },
    { $match: { otherValue: { $type: 'string' } } },
    { $group: {
      _id: { field: '$entries.k', classId: '$attrs.class', size: '$attrs.size', role: '$attrs.role', a: '$entries.v', b: '$otherValue', reference: referenceValue },
      count: { $sum: 1 }, weight: { $sum: '$sampleWeight' }, mismatch: { $sum: { $cond: ['$attrsDiffer', 1, 0] } }
    } }
  ];
  const cells = await RunSample.aggregate<Cell>(stages as unknown as PipelineStage[]).allowDiskUse(true);
  if (cells.some(cell => cell.mismatch)) throw new BadRequestError('Matching sample ids have different attributes');
  const fields = suite.protocol.samples.fields.map(field => {
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
  try { await JudgePair.create({ ...cacheKey, referenceEvaluationId, results }); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  return { ...results, ...(referenceEvaluationId ? { referenceEvaluationId } : {}) };
}
