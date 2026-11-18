import { BadRequestError } from '@visin/backend-core';
import type { PipelineStage } from 'mongoose';
import RunSample from '../models/RunSample';
import { getEvaluation } from './evaluationService';
import { compareJudgePair } from './judgePairService';
import { readableSuite } from './suiteService';
import type { JudgeDisagreementsQuery } from '../validation/evaluationSchemas';

interface PairSample {
  id: string;
  attrs: Record<string, unknown>;
  a: { fields: Record<string, string>; raw?: string };
  b: { fields: Record<string, string>; raw?: string };
  reference?: { fields: Record<string, string> };
}
interface Facet { samples: PairSample[]; total: { count: number }[] }

/** Filter and join in MongoDB; only the requested page and its count leave the database. */
export async function listJudgeDisagreements(a: string, b: string, userId: string | undefined, query: JudgeDisagreementsQuery) {
  // This also verifies both evaluations, their source runs and the reference before any sample can be read.
  const pair = await compareJudgePair(a, b, userId);
  const [left, right] = await Promise.all([getEvaluation(a, userId), getEvaluation(b, userId)]);
  const suite = await readableSuite(left.suite!.slug, left.suite!.version, userId);
  const field = suite.protocol.samples?.fields.find(item => item.key === query.field);
  if (!field) throw new BadRequestError('The requested field is not in the suite');
  if (query.a && !field.values.includes(query.a) || query.b && !field.values.includes(query.b)) throw new BadRequestError('A transition value is not in the suite');
  if (query.reference && !field.values.includes(query.reference)) throw new BadRequestError('The reference value is not in the suite');
  const referenceId = typeof pair.referenceEvaluationId === 'string' ? pair.referenceEvaluationId : undefined;
  if (query.reference && !referenceId) throw new BadRequestError('The suite has no accessible reference');
  const reference = referenceId ? await getEvaluation(referenceId, userId) : undefined;
  const source = left.source!.trainingId!, target = right.source!.trainingId!;
  const lookup = (trainingId: string, as: string) => ({ $lookup: {
    from: RunSample.collection.name,
    let: { sample: '$sampleId' },
    pipeline: [{ $match: { trainingId, $expr: { $eq: ['$sampleId', '$$sample'] } } }, { $project: { fields: 1, raw: 1 } }],
    as
  } });
  const get = (input: string) => ({ $getField: { field: { $literal: query.field }, input } });
  const filters: Record<string, unknown> = { trainingId: source };
  if (query.class) filters['attrs.class'] = query.class;
  if (query.size) filters['attrs.size'] = query.size;
  if (query.role) filters['attrs.role'] = query.role;
  // Narrow the first run's rows before the per-row joins: on a 145k-sample run the joins dominate the cost. A key
  // that cannot be a dotted path is still filtered below, after the join.
  if (/^[A-Za-z0-9_-]+$/.test(query.field)) filters[`fields.${query.field}`] = query.a ?? { $exists: true };
  const expressions: Record<string, unknown>[] = [
    { $ne: [{ $ifNull: ['$valueA', null] }, null] },
    { $ne: [{ $ifNull: ['$valueB', null] }, null] },
    { $ne: ['$valueA', '$valueB'] }
  ];
  if (query.a) expressions.push({ $eq: ['$valueA', { $literal: query.a }] });
  if (query.b) expressions.push({ $eq: ['$valueB', { $literal: query.b }] });
  if (query.reference) expressions.push({ $eq: [get('$reference.fields'), { $literal: query.reference }] });
  const stages: Record<string, unknown>[] = [
    { $match: filters },
    { $sort: { sampleId: 1 } },
    lookup(target, 'otherRows'),
    { $unwind: '$otherRows' },
    ...(reference?.source?.trainingId ? [lookup(reference.source.trainingId, 'referenceRows'), { $set: { reference: { $arrayElemAt: ['$referenceRows', 0] } } }] : []),
    { $set: { valueA: get('$fields'), valueB: get('$otherRows.fields') } },
    { $match: { $expr: { $and: expressions } } },
    { $facet: {
      samples: [
        { $skip: (query.page - 1) * query.limit }, { $limit: query.limit },
        { $project: { _id: 0, id: '$sampleId', attrs: 1, a: { fields: '$fields', raw: '$raw' }, b: { fields: '$otherRows.fields', raw: '$otherRows.raw' }, reference: { fields: '$reference.fields' } } }
      ],
      total: [{ $count: 'count' }]
    } }
  ];
  const [result] = await RunSample.aggregate<Facet>(stages as unknown as PipelineStage[]).allowDiskUse(true);
  const total = result?.total[0]?.count ?? 0;
  return { field: query.field, samples: result?.samples ?? [], pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}
