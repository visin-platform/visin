import { licenseSchema, z } from '@visin/backend-core';
import { hubDataSchema } from '../services/huggingFace';
import { SUBMISSION_POLICIES } from '../models/Suite';
import { parseHttpUrl } from '../services/paperIdentifiers';
import { paginationSchema, sortOrderSchema } from './common';

const SHA256 = /^[0-9a-f]{64}$/;
const sha256 = z
  .string()
  .trim()
  .transform(value => value.toLowerCase())
  .refine(value => SHA256.test(value), 'Expected a 64-character SHA-256 hex digest');

const text = (max: number) => z.string().trim().min(1).max(max);
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

/**
 * What the evaluated data is, pinned so that replacing it changes the suite. A Visin dataset is named by its
 * archive digest, a dataset on a store by that store's own pin (a Hub dataset by a full commit), and anything else by
 * the digest of a manifest of its samples: a display name proves nothing about which bytes were scored. One variant
 * per kind in `SUITE_DATA_KINDS`.
 */
export const suiteDataSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('visin'), datasetId: text(100), archiveSha256: sha256 }),
  hubDataSchema,
  z.strictObject({ kind: z.literal('external'), label: text(200), manifestSha256: sha256 })
]);

/**
 * What the publisher says about the data: its licence, where it lives and the credit it asks for. Not part of the
 * protocol, so it is not hashed and can be corrected later. It is never copied from a previous version: a licence
 * shown for the wrong data is worse than none.
 */
export const dataTermsSchema = z
  .strictObject({
    license: licenseSchema.optional(),
    sourceUrl: z
      .string()
      .trim()
      .max(500)
      .refine(value => parseHttpUrl(value) !== undefined, 'Expected an http(s) address')
      .optional(),
    credit: text(1000).optional()
  })
  .refine(terms => Object.keys(terms).length > 0, 'Give a licence, a source address or a credit line');
export type DataTermsInput = z.infer<typeof dataTermsSchema>;

const conditionSchema = z.strictObject({
  /** the key the results carry for it: `day`, `night`, one per test set */
  name: text(100),
  /** how many samples a faithful run of this condition scores */
  sampleCount: z.number().int().positive()
});

const classSchema = z.strictObject({ id: text(100), name: text(200).optional() });

/** The only calculations a sample-scored suite can request. Names and values refer to its declared fields. */
const derivationSchema = z.string().max(500).regex(
  /^(?:share:[^:=]+=[^=]+|(?:error|fa|fr):[^:=]+|latency:mean)$/,
  'Expected share:<field>=<value>, error:<field>, fa:<field>, fr:<field> or latency:mean'
);

const metricSchema = z.strictObject({
  /** a key in a condition's `overall` block, and in the top-level one */
  key: text(100),
  direction: z.enum(['max', 'min']),
  /** `ratio`, `%`, `ms`: informational, the range says the scale */
  unit: text(20).optional(),
  /** a value outside it is a different scale or a broken run, never a score */
  range: z
    .strictObject({ min: z.number().finite(), max: z.number().finite() })
    .refine(range => range.min <= range.max, 'min must not exceed max')
    .optional(),
  headline: z.boolean().optional(),
  derivation: derivationSchema.optional(),
  /** Explicitly treat absent predictions as a declared value for a false-accept/reject metric. */
  missingValue: text(200).optional(),
  /** Restrict a sample metric to declared attribute values, such as role=classify. */
  filter: z.record(text(100), text(200)).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 20, 'Give 1–20 attribute filters').optional()
});

/**
 * How `overall` is formed. `equal-mean-of-conditions` and `sample-weighted-mean` are computed by the server from
 * the condition scores, so a skipped condition cannot lift the ranked number; `pooled` is a figure only the
 * evaluator can compute (counts over every sample) and is read from the result's top-level `overall`.
 */
export const AGGREGATIONS = ['equal-mean-of-conditions', 'sample-weighted-mean', 'pooled'] as const;

const inputSchema = z.strictObject({
  sensors: z.array(text(100)).max(20).optional(),
  resolution: text(100).optional(),
  preprocessing: text(500).optional(),
  postprocessing: text(500).optional(),
  calibration: text(500).optional()
});

const uniqueBy = <T>(items: T[], key: (item: T) => string) => new Set(items.map(key)).size === items.length;

/**
 * The sample attributes scoring groups by: `class` names one of the protocol's classes and `size` one of its
 * conditions. Every sample must carry both, or the run it belongs to could never be scored.
 */
export const SAMPLE_SCORING_ATTRS: readonly (readonly ['class' | 'size', (protocol: { classes: { id: string }[]; conditions: { name: string }[] }) => string[]])[] = [
  ['class', protocol => protocol.classes.map(item => item.id)],
  ['size', protocol => protocol.conditions.map(item => item.name)]
];

const sampleAttributeSchema = z.strictObject({
  key: text(100),
  values: z.array(text(200)).min(1).max(500).refine(values => uniqueBy(values, value => value), 'Values must be unique').optional()
});
const sampleFieldSchema = sampleAttributeSchema.extend({
  values: z.array(text(200)).min(1).max(500).refine(values => uniqueBy(values, value => value), 'Values must be unique'),
  abstain: text(200).optional(),
  /** Fields such as raw verdicts may be absent for geometry-only decisions. */
  required: z.boolean().optional(),
  /** Values considered an acceptance when calculating false accepts and false rejects. */
  accept: z.array(text(200)).min(1).max(500).optional()
}).refine(
  field => field.abstain === undefined || field.values.includes(field.abstain),
  { message: 'Abstain must be an allowed value', path: ['abstain'] }
).refine(
  field => !field.accept || (uniqueBy(field.accept, value => value) && field.accept.every(value => field.values.includes(value) && value !== field.abstain) && field.values.some(value => value !== field.abstain && !field.accept!.includes(value))),
  { message: 'Acceptance values must be unique allowed, non-abstaining values and leave at least one other value', path: ['accept'] }
);
const samplesSchema = z.strictObject({
  attrs: z.array(sampleAttributeSchema).max(100).refine(items => uniqueBy(items, item => item.key), 'Attribute keys must be unique'),
  fields: z.array(sampleFieldSchema).min(1).max(100).refine(items => uniqueBy(items, item => item.key), 'Field keys must be unique'),
  weight: text(100).optional()
}).refine(samples => samples.weight === undefined || samples.attrs.some(attr => attr.key === samples.weight), {
  message: 'Weight must name an attribute', path: ['weight']
}).refine(samples => samples.weight === undefined || !samples.attrs.find(attr => attr.key === samples.weight)?.values, {
  message: 'Weight must be a numeric attribute without a vocabulary', path: ['weight']
});

/**
 * The scoring protocol: everything that decides what a score means. It is hashed, so a field added here is a
 * field that changes a suite's identity, and the object is strict so nothing unhashed can ride along.
 */
export const suiteProtocolSchema = z
  .strictObject({
    task: text(100),
    data: suiteDataSchema,
    split: text(100),
    annotationVersion: text(100).optional(),
    conditions: z.array(conditionSchema).min(1).max(50),
    classes: z.array(classSchema).max(200).default([]),
    /** class ids left out of every score */
    ignoredClasses: z.array(text(100)).max(200).default([]),
    metrics: z.array(metricSchema).min(1).max(30),
    aggregation: z.enum(AGGREGATIONS),
    input: inputSchema.default({}),
    evaluator: z.strictObject({ package: text(100), minVersion: text(50).optional() }),
    samples: samplesSchema.optional(),
    reference: z.strictObject({ samplesDigest: sha256 }).optional(),
    settings: z.record(z.string(), z.unknown()).optional()
  })
  .refine(protocol => uniqueBy(protocol.conditions, condition => condition.name), {
    message: 'Condition names must be unique',
    path: ['conditions']
  })
  .refine(protocol => uniqueBy(protocol.classes, item => item.id), { message: 'Class ids must be unique', path: ['classes'] })
  .refine(protocol => uniqueBy(protocol.metrics, metric => metric.key), {
    message: 'Metric keys must be unique',
    path: ['metrics']
  })
  .refine(protocol => protocol.metrics.filter(metric => metric.headline).length === 1, {
    message: 'Exactly one metric must be the headline',
    path: ['metrics']
  })
  .refine(protocol => protocol.conditions.every(condition => condition.name !== 'overall'), {
    message: '"overall" is the whole-test key and cannot be a condition',
    path: ['conditions']
  })
  .superRefine((protocol, ctx) => {
    if (protocol.samples && protocol.classes.some(item => item.id === 'overall')) {
      ctx.addIssue({ code: 'custom', path: ['classes'], message: '"overall" is reserved for aggregate scores' });
    }
    // Scoring groups samples by these two attributes, so a suite without them could never score a run.
    if (protocol.samples) {
      for (const [key, allowed] of SAMPLE_SCORING_ATTRS) {
        const attr = protocol.samples.attrs.find(item => item.key === key);
        const names = allowed(protocol);
        if (!attr) ctx.addIssue({ code: 'custom', path: ['samples', 'attrs'], message: `A sample suite needs a "${key}" attribute: samples are scored by it` });
        else if (attr.values?.some(value => !names.includes(value))) {
          ctx.addIssue({ code: 'custom', path: ['samples', 'attrs'], message: `Every "${key}" value must be one of the protocol's ${key === 'class' ? 'classes' : 'conditions'}` });
        }
      }
    }
    for (const [index, metric] of protocol.metrics.entries()) {
      if (metric.missingValue && (!metric.derivation || !/^(?:fa|fr):/.test(metric.derivation))) {
        ctx.addIssue({ code: 'custom', path: ['metrics', index, 'missingValue'], message: 'Missing values require a false-accept or false-reject derivation' });
      }
      if (metric.filter) {
        if (!protocol.samples || !metric.derivation) {
          ctx.addIssue({ code: 'custom', path: ['metrics', index, 'filter'], message: 'Metric filters require a sample derivation' });
        } else for (const [key, value] of Object.entries(metric.filter)) {
          const attr = protocol.samples.attrs.find(item => item.key === key);
          if (!attr?.values?.includes(value)) ctx.addIssue({ code: 'custom', path: ['metrics', index, 'filter', key], message: 'Filter must name an allowed value of a declared categorical attribute' });
        }
      }
      if (!metric.derivation) continue;
      const path = ['metrics', index, 'derivation'];
      if (!protocol.samples) {
        ctx.addIssue({ code: 'custom', path, message: 'A derivation requires a sample protocol' });
        continue;
      }
      if (metric.derivation === 'latency:mean') continue;
      const [kind, expression] = metric.derivation.split(':');
      const [fieldKey, value] = expression.split('=');
      const field = protocol.samples.fields.find(item => item.key === fieldKey);
      if (!field) ctx.addIssue({ code: 'custom', path, message: 'Derivation must name a declared field' });
      else if (metric.missingValue && (!field.values.includes(metric.missingValue) || metric.missingValue === field.abstain)) ctx.addIssue({ code: 'custom', path: ['metrics', index, 'missingValue'], message: 'Missing value must be an allowed, non-abstaining field value' });
      else if (kind === 'share' && !field.values.includes(value)) ctx.addIssue({ code: 'custom', path, message: 'Share value must be allowed for the field' });
      else if ((kind === 'fa' || kind === 'fr') && !field.accept) ctx.addIssue({ code: 'custom', path, message: 'False accept and reject require acceptance values on the field' });
      if (kind !== 'share' && !protocol.reference) ctx.addIssue({ code: 'custom', path, message: 'This derivation requires a reference digest' });
    }
  });
export type SuiteProtocol = z.infer<typeof suiteProtocolSchema>;
export type SuiteProtocolInput = z.input<typeof suiteProtocolSchema>;

export const createSuiteBodySchema = z.object({
  slug: z.string().trim().regex(SLUG, 'Lowercase letters, digits and hyphens'),
  version: z.number().int().positive().max(100000),
  name: text(200),
  description: z.string().trim().max(2000).optional(),
  /** a project the suite is owned through; the suite follows its owner and visibility */
  projectId: z.string().min(1),
  visibility: z.enum(['private', 'public']).optional(),
  /** who may publish results to its public leaderboard; `open` when left out */
  submissions: z.enum(SUBMISSION_POLICIES).optional(),
  /** what the evaluated data is licensed under; unstated when left out, and not inherited from an earlier version */
  dataTerms: dataTermsSchema.optional(),
  protocol: suiteProtocolSchema
});
export type CreateSuiteBody = z.infer<typeof createSuiteBodySchema>;

/** A protocol to digest without publishing it: the file an evaluator is about to run. */
export const checkSuiteBodySchema = z.object({ protocol: suiteProtocolSchema });
export type CheckSuiteBody = z.infer<typeof checkSuiteBodySchema>;

export const updateSuiteBodySchema = z
  .object({
    name: text(200).optional(),
    /** `null` clears it */
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(['private', 'public']).optional(),
    /** who may publish results to its public leaderboard; changing it leaves what is published as it is */
    submissions: z.enum(SUBMISSION_POLICIES).optional(),
    /** replaces what is declared about the evaluated data; `null` takes it back */
    dataTerms: dataTermsSchema.nullable().optional(),
    /** stops new evaluations; the suite and its results stay readable */
    archived: z.boolean().optional()
  })
  .refine(body => Object.keys(body).length > 0, 'Nothing to change');
export type UpdateSuiteBody = z.infer<typeof updateSuiteBodySchema>;

/** A version number, or `latest` for the highest one that is not archived. */
export const suiteVersionParam = z.union([z.literal('latest'), z.coerce.number().int().positive()]);

export const suiteParamsSchema = z.object({
  slug: z.string().trim().regex(SLUG, 'Lowercase letters, digits and hyphens'),
  version: suiteVersionParam
});
export type SuiteParams = z.infer<typeof suiteParamsSchema>;

/** Updating needs a concrete version: `latest` moves, and a change should name what it changes. */
export const suiteUpdateParamsSchema = z.object({
  slug: z.string().trim().regex(SLUG, 'Lowercase letters, digits and hyphens'),
  version: z.coerce.number().int().positive()
});

export const listSuitesQuerySchema = z.object({
  ...paginationSchema,
  slug: z.string().trim().min(1).optional(),
  /** Words to find in a suite's name, slug, description or task: a substring, not a pattern. */
  search: z.string().trim().min(1).max(200).optional(),
  projectId: z.string().min(1).optional(),
  includeArchived: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  order: sortOrderSchema('desc')
});
export type ListSuitesQuery = z.infer<typeof listSuitesQuerySchema>;
