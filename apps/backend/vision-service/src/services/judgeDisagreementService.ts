import { BadRequestError } from '@visin/backend-core';
import JudgePair from '../models/JudgePair';
import JudgeDisagreement, { DISAGREEMENTS_VERSION } from '../models/JudgeDisagreement';
import { lookupSamples, type JoinedRow } from './sampleJoin';
import { compareJudgePair, ensureJudgeDisagreements, resolveJudgePair } from './judgePairService';
import type { JudgeDisagreementsQuery } from '../validation/evaluationSchemas';

/**
 * A page of the samples two judges disagree on. The pair's disagreements are stored once (see
 * `buildJudgeDisagreements`) and read here with an index on pair, field and sample, so filters and later pages cost
 * an indexed query whatever the size of the runs.
 */
export async function listJudgeDisagreements(a: string, b: string, userId: string | undefined, query: JudgeDisagreementsQuery) {
  // Resolving checks both evaluations, their runs and the reference against the caller before anything is read.
  const pair = await resolveJudgePair(a, b, userId);
  const field = pair.suite.protocol.samples?.fields.find(item => item.key === query.field);
  if (!field) throw new BadRequestError('The requested field is not in the suite');
  if (query.a && !field.values.includes(query.a) || query.b && !field.values.includes(query.b)) throw new BadRequestError('A transition value is not in the suite');
  if (query.reference && !field.values.includes(query.reference)) throw new BadRequestError('The reference value is not in the suite');
  if (query.reference && !pair.referenceRunId) throw new BadRequestError('The suite has no accessible reference');

  // The comparison is what creates (and caches) the pair; its disagreements are stored the first time they are asked for.
  let stored = await JudgePair.findOne(pair.cacheKey).select('_id disagreementsReady disagreementsVersion').lean();
  if (!stored) {
    await compareJudgePair(a, b, userId);
    stored = await JudgePair.findOne(pair.cacheKey).select('_id disagreementsReady disagreementsVersion').lean();
  }
  if (!stored) throw new BadRequestError('The comparison could not be stored');
  const pairId = String(stored._id);
  if (!stored.disagreementsReady || stored.disagreementsVersion !== DISAGREEMENTS_VERSION) await ensureJudgeDisagreements(pair, pairId);

  const value: Record<string, unknown> = { field: field.key };
  if (query.a) value.a = query.a;
  if (query.b) value.b = query.b;
  if (query.reference) value.reference = query.reference;
  const filter: Record<string, unknown> = { pair: pairId, 'values.field': field.key, values: { $elemMatch: value } };
  if (query.class) filter.class = query.class;
  if (query.size) filter.size = query.size;
  if (query.role) filter.role = query.role;
  const [total, rows] = await Promise.all([
    JudgeDisagreement.countDocuments(filter),
    JudgeDisagreement.find(filter).sort({ sampleId: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).select('sampleId').lean()
  ]);
  // The page's samples, read from their runs: a few indexed lookups for what is shown, nothing copied.
  const ids = rows.map(row => row.sampleId);
  const reference = pair.referenceRunId;
  const [left, right, third] = await Promise.all([
    lookupSamples(pair.runA, ids),
    lookupSamples(pair.runB, ids),
    reference && reference !== pair.runA && reference !== pair.runB ? lookupSamples(reference, ids) : undefined
  ]);
  const referenceRow = (id: string): JoinedRow | undefined =>
    !reference ? undefined : reference === pair.runA ? left.get(id) : reference === pair.runB ? right.get(id) : third?.get(id);
  const samples = ids.flatMap(id => {
    const a = left.get(id);
    const b = right.get(id);
    if (!a || !b) return [];
    const r = referenceRow(id);
    return [{
      id,
      attrs: a.attrs,
      a: { fields: a.fields, ...(a.raw !== undefined ? { raw: a.raw } : {}) },
      b: { fields: b.fields, ...(b.raw !== undefined ? { raw: b.raw } : {}) },
      ...(r ? { reference: { fields: r.fields } } : {})
    }];
  });
  return {
    field: field.key,
    samples,
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
  };
}
