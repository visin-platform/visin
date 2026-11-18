import { BadRequestError } from '@visin/backend-core';
import { canonicalJson } from './suiteProtocol';
import { joinRuns } from './sampleJoin';
import type { SuiteProtocol } from '../validation/suiteSchemas';

type Counter = { numerator: number; denominator: number };
type Group = { _id: { condition: string; classId: string }; count: number; [key: string]: unknown };

/** Present as the old aggregation read it (`$ifNull` to null): neither missing nor null. */
const present = (value: unknown): boolean => value !== undefined && value !== null;
/** Equal as MongoDB's `$ne` compared two attribute values, a missing one equal to another missing one. */
const sameValue = (a: unknown, b: unknown): boolean => canonicalJson(a ?? null) === canonicalJson(b ?? null);
const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/**
 * Score a run from its samples in one ordered pass, joined to the reference run by sample id (see `joinRuns`), and
 * return the small class-by-condition result. Linear in the run's size: no sample is looked up on its own.
 */
export async function scoreSampleRun(trainingId: string, protocol: SuiteProtocol, referenceTrainingId?: string) {
  if (!protocol.samples || protocol.metrics.some(metric => !metric.derivation)) {
    throw new BadRequestError('Every sample-suite metric needs a derivation');
  }
  const samples = protocol.samples;
  const needsReference = protocol.metrics.some(metric => /^(?:error|fa|fr):/.test(metric.derivation!));
  if (needsReference && !referenceTrainingId) throw new BadRequestError('The reference run is required');

  // Each metric's derivation, read once rather than per sample.
  const plans = protocol.metrics.map(metric => {
    const derivation = metric.derivation!;
    const filter = Object.entries(metric.filter ?? {});
    if (derivation === 'latency:mean') return { kind: 'latency' as const, filter };
    const [kind, expression] = derivation.split(':');
    const [key, value] = expression.split('=');
    const field = samples.fields.find(item => item.key === key)!;
    return { kind: kind as 'share' | 'error' | 'fa' | 'fr', filter, key, value, field, missingValue: metric.missingValue };
  });

  const groups = new Map<string, Group>();
  for await (const { row, others: [reference] } of joinRuns(trainingId, [needsReference ? referenceTrainingId : undefined])) {
    const attrs = recordOf(row.attrs);
    const fields = recordOf(row.fields);
    const condition = attrs.size as string;
    const classId = attrs.class as string;
    const groupKey = JSON.stringify([condition ?? null, classId ?? null]);
    let group = groups.get(groupKey);
    if (!group) {
      group = { _id: { condition, classId }, count: 0, referenceMismatch: 0 };
      plans.forEach((_plan, index) => { group![`n${index}`] = 0; group![`d${index}`] = 0; });
      groups.set(groupKey, group);
    }
    group.count += 1;
    const referenceAttrs = reference ? recordOf(reference.attrs) : undefined;
    if (needsReference && referenceAttrs && samples.attrs.some(attr => !sameValue(attrs[attr.key], referenceAttrs[attr.key]))) {
      group.referenceMismatch = (group.referenceMismatch as number) + 1;
    }
    const referenceFields = reference ? recordOf(reference.fields) : {};
    plans.forEach((plan, index) => {
      if (!plan.filter.every(([key, value]) => attrs[key] === value)) return;
      if (plan.kind === 'latency') {
        group![`n${index}`] = (group![`n${index}`] as number) + (row.latencyMs ?? 0);
        if (present(row.latencyMs)) group![`d${index}`] = (group![`d${index}`] as number) + 1;
        return;
      }
      const actual = present(fields[plan.key]) ? fields[plan.key] : plan.missingValue;
      if (!present(actual) || (plan.field.abstain !== undefined && actual === plan.field.abstain)) return;
      let counted: boolean;
      let hit: boolean;
      if (plan.kind === 'share') {
        counted = true;
        hit = actual === plan.value;
      } else {
        const expected = referenceFields[plan.key];
        if (!present(expected) || (plan.field.abstain !== undefined && expected === plan.field.abstain)) return;
        if (plan.kind === 'error') {
          counted = true;
          hit = actual !== expected;
        } else {
          const accepts = plan.field.accept!;
          const actualAccepted = accepts.includes(actual as string);
          const referenceAccepted = accepts.includes(expected as string);
          counted = plan.kind === 'fa' ? !referenceAccepted : referenceAccepted;
          hit = plan.kind === 'fa' ? actualAccepted : !actualAccepted;
        }
      }
      if (!counted) return;
      group![`d${index}`] = (group![`d${index}`] as number) + 1;
      if (hit) group![`n${index}`] = (group![`n${index}`] as number) + 1;
    });
  }

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
  for (const row of groups.values()) {
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
