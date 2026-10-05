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
  headline: z.boolean().optional()
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
    evaluator: z.strictObject({ package: text(100), minVersion: text(50).optional() })
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
  projectId: z.string().min(1).optional(),
  includeArchived: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  order: sortOrderSchema('desc')
});
export type ListSuitesQuery = z.infer<typeof listSuitesQuerySchema>;
