import { BadRequestError } from '@visin/backend-core';
import JudgePair from '../models/JudgePair';
import JudgeDisagreement from '../models/JudgeDisagreement';
import { buildJudgeDisagreements, compareJudgePair, resolveJudgePair } from './judgePairService';
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
  let stored = await JudgePair.findOne(pair.cacheKey).select('_id disagreementsReady').lean();
  if (!stored) {
    await compareJudgePair(a, b, userId);
    stored = await JudgePair.findOne(pair.cacheKey).select('_id disagreementsReady').lean();
  }
  if (!stored) throw new BadRequestError('The comparison could not be stored');
  const pairId = String(stored._id);
  if (!stored.disagreementsReady) await buildJudgeDisagreements(pair, pairId);

  const filter: Record<string, unknown> = { pair: pairId, field: field.key };
  if (query.class) filter.class = query.class;
  if (query.size) filter.size = query.size;
  if (query.role) filter.role = query.role;
  if (query.a) filter.a = query.a;
  if (query.b) filter.b = query.b;
  if (query.reference) filter.reference = query.reference;
  const [total, rows] = await Promise.all([
    JudgeDisagreement.countDocuments(filter),
    JudgeDisagreement.find(filter).sort({ sampleId: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).select('sample').lean()
  ]);
  return {
    field: field.key,
    samples: rows.map(row => row.sample),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
  };
}
