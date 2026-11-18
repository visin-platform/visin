import { BadRequestError } from '@visin/backend-core';
import type { PipelineStage } from 'mongoose';
import RunSample from '../models/RunSample';
import type { SuiteProtocol } from '../validation/suiteSchemas';

type Expression = Record<string, unknown> | string | number | boolean | null;
type Counter = { numerator: number; denominator: number };
type Group = { _id: { condition: string; classId: string }; count: number; [key: string]: unknown };

const eq = (a: unknown, b: unknown): Expression => ({ $eq: [a, b] });
const and = (...conditions: unknown[]): Expression => ({ $and: conditions });
const present = (value: unknown): Expression => ({ $ne: [{ $ifNull: [value, null] }, null] });
const fieldAt = (key: string, source = '$fields'): Expression => ({ $getField: { field: { $literal: key }, input: source } });
const conditionalCount = (condition: unknown): Expression => ({ $sum: { $cond: [condition, 1, 0] } });

/** Aggregate individual samples in Mongo; only the small class-by-condition result is returned to the service. */
export async function scoreSampleRun(trainingId: string, protocol: SuiteProtocol, referenceTrainingId?: string) {
  if (!protocol.samples || protocol.metrics.some(metric => !metric.derivation)) {
    throw new BadRequestError('Every sample-suite metric needs a derivation');
  }
  const needsReference = protocol.metrics.some(metric => /^(?:error|fa|fr):/.test(metric.derivation!));
  if (needsReference && !referenceTrainingId) throw new BadRequestError('The reference run is required');
  const stages: Record<string, unknown>[] = [{ $match: { trainingId } }];
  if (needsReference) {
    stages.push({ $lookup: {
      from: RunSample.collection.name,
      let: { sample: '$sampleId' },
      pipeline: [
        { $match: { trainingId: referenceTrainingId, $expr: { $eq: ['$sampleId', '$$sample'] } } },
        { $project: { fields: 1, attrs: 1 } }
      ],
      as: 'referenceRows'
    } }, { $set: { referenceRow: { $arrayElemAt: ['$referenceRows', 0] } } });
  }
  const group: Record<string, unknown> = { _id: { condition: '$attrs.size', classId: '$attrs.class' }, count: { $sum: 1 } };
  if (needsReference) {
    const differentAttrs = protocol.samples.attrs.map(attr => ({ $ne: [fieldAt(attr.key, '$attrs'), fieldAt(attr.key, '$referenceRow.attrs')] }));
    group.referenceMismatch = conditionalCount(and(present('$referenceRow'), { $or: differentAttrs.length ? differentAttrs : [false] }));
  }
  protocol.metrics.forEach((metric, index) => {
    const derivation = metric.derivation!;
    const matchesFilter = and(...Object.entries(metric.filter ?? {}).map(([key, value]) => eq(fieldAt(key, '$attrs'), { $literal: value })));
    if (derivation === 'latency:mean') {
      group[`n${index}`] = { $sum: { $cond: [matchesFilter, { $ifNull: ['$latencyMs', 0] }, 0] } };
      group[`d${index}`] = conditionalCount(and(matchesFilter, present('$latencyMs')));
      return;
    }
    const [kind, expression] = derivation.split(':');
    const [key, value] = expression.split('=');
    const field = protocol.samples!.fields.find(item => item.key === key)!;
    const actual = metric.missingValue ? { $ifNull: [fieldAt(key), { $literal: metric.missingValue }] } : fieldAt(key);
    const actualValid = and(matchesFilter, present(actual), ...(field.abstain ? [{ $ne: [actual, { $literal: field.abstain }] }] : []));
    let denominator: Expression = actualValid;
    let numerator: Expression = and(actualValid, eq(actual, { $literal: value }));
    if (kind !== 'share') {
      const reference = fieldAt(key, '$referenceRow.fields');
      const valid = and(actualValid, present(reference), ...(field.abstain ? [{ $ne: [reference, { $literal: field.abstain }] }] : []));
      denominator = valid;
      numerator = and(valid, { $ne: [actual, reference] });
      if (kind === 'fa' || kind === 'fr') {
        const actualAccepted = { $in: [actual, { $literal: field.accept! }] };
        const referenceAccepted = { $in: [reference, { $literal: field.accept! }] };
        denominator = and(valid, kind === 'fa' ? { $not: [referenceAccepted] } : referenceAccepted);
        numerator = and(denominator, kind === 'fa' ? actualAccepted : { $not: [actualAccepted] });
      }
    }
    group[`n${index}`] = conditionalCount(numerator);
    group[`d${index}`] = conditionalCount(denominator);
  });
  stages.push({ $group: group });
  const groups = await RunSample.aggregate<Group>(stages as unknown as PipelineStage[]);
  const counts: Record<string, number> = Object.create(null) as Record<string, number>;
  const totals = new Map<string, Counter[]>();
  const results: Record<string, Record<string, Record<string, number>>> = Object.create(null) as Record<string, Record<string, Record<string, number>>>;
  const add = (key: string, groupRow: Group) => {
    const counters = totals.get(key) ?? protocol.metrics.map(() => ({ numerator: 0, denominator: 0 }));
    counters.forEach((counter, index) => {
      counter.numerator += Number(groupRow[`n${index}`] ?? 0);
      counter.denominator += Number(groupRow[`d${index}`] ?? 0);
    });
    totals.set(key, counters);
  };
  for (const row of groups) {
    if (Number(row.referenceMismatch ?? 0) > 0) throw new BadRequestError('Reference and run attributes differ for matching sample ids');
    const { condition, classId } = row._id;
    if (!protocol.conditions.some(item => item.name === condition) || !protocol.classes.some(item => item.id === classId)) {
      throw new BadRequestError('Sample class or condition is absent from the protocol');
    }
    counts[condition] = (counts[condition] ?? 0) + row.count;
    add(JSON.stringify([condition, 'overall']), row);
    add(JSON.stringify([condition, classId]), row);
    add(JSON.stringify(['overall', 'overall']), row);
    add(JSON.stringify(['overall', classId]), row);
  }
  for (const [key, counters] of totals) {
    const [condition, classId] = JSON.parse(key) as [string, string];
    const metrics: Record<string, number> = Object.create(null) as Record<string, number>;
    counters.forEach((counter, index) => {
      const metric = protocol.metrics[index];
      if (counter.denominator) metrics[metric.key] = (counter.numerator / counter.denominator) * (metric.unit === '%' ? 100 : 1);
    });
    (results[condition] ??= Object.create(null) as Record<string, Record<string, number>>)[classId] = metrics;
  }
  return { results, sampleCounts: counts };
}
