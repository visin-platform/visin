import { z } from '@visin/backend-core';
import { SAMPLE_SCORING_ATTRS, type SuiteProtocol } from './suiteSchemas';

const sampleValue = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.array(z.number().finite()).max(16)]);
export const runSampleSchema = z.strictObject({
  id: z.string().trim().min(1).max(200),
  attrs: z.record(z.string().min(1).max(100), sampleValue),
  fields: z.record(z.string().min(1).max(100), z.string().max(200)),
  abstained: z.boolean().optional(),
  parseFailed: z.boolean().optional(),
  raw: z.string().refine(value => Buffer.byteLength(value, 'utf8') <= 1024, 'Raw reply must be at most 1024 bytes').optional(),
  latencyMs: z.number().finite().nonnegative().optional()
}).refine(row => Object.keys(row.fields).length > 0, 'At least one sample field is required');

export const runSampleBatchSchema = z.strictObject({ samples: z.array(runSampleSchema).min(1).max(5000) })
  .refine(batch => new Set(batch.samples.map(sample => sample.id)).size === batch.samples.length, 'Sample ids must be unique within a batch');

export const listRunSamplesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  attrs: z.string().max(4000).optional(),
  fields: z.string().max(4000).optional()
});
export type ListRunSamplesQuery = z.infer<typeof listRunSamplesQuerySchema>;

export type RunSampleInput = z.infer<typeof runSampleSchema>;

/**
 * Checks the vocabulary before storage. A missing abstention is distinct from false. Samples are immutable once
 * their run completes, so anything scoring would refuse later (a sample without a known class or condition) is
 * refused here, on the first batch, rather than after a run of days has been sealed.
 */
export function sampleProtocolErrors(sample: RunSampleInput, suite: Pick<SuiteProtocol, 'classes' | 'conditions' | 'samples'>): string[] {
  const protocol = suite.samples;
  if (!protocol) return ['The suite is not sample-scored'];
  const errors: string[] = [];
  for (const [key, allowed] of SAMPLE_SCORING_ATTRS) {
    const value = sample.attrs[key];
    // A declared vocabulary is a subset of these names (the suite schema checks it) and is checked below.
    const declared = protocol.attrs.find(attr => attr.key === key)?.values;
    if (value === undefined) errors.push(`Missing attribute: ${key}`);
    else if (!declared && (typeof value !== 'string' || !allowed(suite).includes(value))) errors.push(`Attribute ${key} must be one of the suite's ${key === 'class' ? 'classes' : 'conditions'}`);
  }
  const attrs = new Map(protocol.attrs.map(attr => [attr.key, attr]));
  const fields = new Map(protocol.fields.map(field => [field.key, field]));
  for (const [key, value] of Object.entries(sample.attrs)) {
    const attr = attrs.get(key);
    if (!attr) errors.push(`Unknown attribute: ${key}`);
    else if (attr.values && (typeof value !== 'string' || !attr.values.includes(value))) errors.push(`Invalid value for attribute: ${key}`);
  }
  for (const [key, value] of Object.entries(sample.fields)) {
    const field = fields.get(key);
    if (!field) errors.push(`Unknown field: ${key}`);
    else if (!field.values.includes(value)) errors.push(`Invalid value for field: ${key}`);
  }
  for (const field of protocol.fields) if (field.required && !(field.key in sample.fields)) errors.push(`Missing field: ${field.key}`);
  if (protocol.weight && (typeof sample.attrs[protocol.weight] !== 'number' || (sample.attrs[protocol.weight] as number) < 0)) {
    errors.push(`Invalid weight: ${protocol.weight}`);
  }
  return errors;
}
