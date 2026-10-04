import { z } from '@visin/backend-core';
import { hubCheckpointSchema, hubDataSchema } from '../services/huggingFace';
import { paginationSchema, sortOrderSchema } from './common';
import { VALIDATION_STATES } from '../services/evaluationEligibility';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const text = (max: number) => z.string().trim().min(1).max(max);
const sha256 = z
  .string()
  .trim()
  .transform(value => value.toLowerCase())
  .refine(value => /^[0-9a-f]{64}$/.test(value), 'Expected a 64-character SHA-256 hex digest');

/** `slug@version`, a concrete version: `latest` moves, and a result must name what it was judged on. */
export const SUITE_REF = /^([a-z0-9][a-z0-9-]{0,62}[a-z0-9]|[a-z0-9])@([1-9][0-9]{0,5})$/;
const suiteRef = z
  .string()
  .trim()
  .regex(SUITE_REF, 'Expected "slug@version", such as "road-test@1"')
  .transform(value => {
    const [slug, version] = value.split('@');
    return { slug, version: Number(version) };
  });

/** One variant per kind of checkpoint (`CHECKPOINT_KINDS`): held on a store, or outside Visin and named by its digest. */
export const checkpointSchema = z.discriminatedUnion('kind', [
  hubCheckpointSchema,
  z.strictObject({ kind: z.literal('local'), sha256, label: text(200) })
]);

/**
 * What the evaluator observed about the run, to be compared with what the suite pins. Everything here is optional
 * and none of it is needed to be ranked: with the data, the protocol digest and the evaluator all present and
 * matching, a result is labelled `observed`; with less it is `reported`. What is sent must match, or the result
 * is incompatible. `classes` is compared when sent. Nothing here is proof; it is the evaluator's own report of the
 * digest of the protocol file it loaded and the data it read.
 */
export const evidenceSchema = z.strictObject({
  /** the data actually scored, in the shape a suite pins it: an archive digest, a Hub commit, or a manifest digest */
  data: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('visin'), archiveSha256: sha256 }),
      hubDataSchema,
      z.strictObject({ kind: z.literal('external'), manifestSha256: sha256 })
    ])
    .optional(),
  /** the digest of the protocol file the evaluator actually ran, as `POST /api/suites/check` computes it */
  protocolDigest: sha256.optional(),
  evaluator: z.strictObject({ package: text(100), version: text(50) }).optional(),
  /** the class ids the evaluator scored, and the ones it left out */
  classes: z
    .strictObject({ scored: z.array(text(100)).max(200), ignored: z.array(text(100)).max(200).default([]) })
    .optional()
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** Words that, as a whole word of a key, mean it holds a credential: `HF_TOKEN`, `authToken`, `api_key`. */
const SECRET_WORDS = new Set(['token', 'tokens', 'secret', 'secrets', 'password', 'passwords', 'passwd', 'credential', 'credentials', 'authorization', 'apikey', 'apikeys']);
/** Pairs of adjacent words that say the same: `api` + `key`, `private` + `key`. */
const SECRET_PAIRS = [['api', 'key'], ['private', 'key'], ['secret', 'key'], ['access', 'key']];

/**
 * Whether a key names a credential. The key is read as words (split on punctuation and camelCase) and a credential
 * word must be a word of its own, so `access_token` and `HF_TOKEN` are refused while `tokenizers`, a package that
 * nearly every Hugging Face environment lists, is not: a substring match would refuse an honest environment dump.
 */
export function isSecretKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((word, index) => SECRET_WORDS.has(word) || SECRET_PAIRS.some(([first, second]) => word === first && words[index + 1] === second));
}

const MAX_RESULTS_BYTES = 2_000_000;
const MAX_PROVENANCE_BYTES = 64_000;

/**
 * Depth of the deepest nesting, stopping early past `limit` so a hostile body costs little to refuse. A loop, not a
 * spread into `Math.max`: an array of a few hundred thousand numbers is a legal result and would overflow the stack.
 */
function depthOf(value: unknown, limit: number, depth = 0): number {
  if (depth > limit || !value || typeof value !== 'object') return depth;
  let deepest = depth;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepest = Math.max(deepest, depthOf(child, limit, depth + 1));
    if (deepest > limit) break;
  }
  return deepest;
}

/** The dotted paths of every key that looks like a credential, so the refusal can name them. */
export function secretPaths(value: unknown, prefix = '', found: string[] = []): string[] {
  if (!value || typeof value !== 'object' || found.length >= 10) return found;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (found.length >= 10) break;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isSecretKey(key)) found.push(path);
    else secretPaths(item, path, found);
  }
  return found;
}

const bounded = (maxBytes: number, maxDepth: number) => (value: unknown) =>
  JSON.stringify(value).length <= maxBytes && depthOf(value, maxDepth) <= maxDepth;

const resultsSchema = z
  .record(z.string().max(200), z.unknown())
  .refine(bounded(MAX_RESULTS_BYTES, 8), 'Results are too large or too deeply nested');
const provenanceSchema = z
  .record(z.string().max(200), z.unknown())
  .refine(bounded(MAX_PROVENANCE_BYTES, 6), 'Provenance is too large or too deeply nested')
  .superRefine((value, context) => {
    const found = secretPaths(value);
    if (found.length > 0) context.addIssue({ code: 'custom', message: `Provenance must not carry credentials; remove: ${found.join(', ')}` });
  });

/**
 * A result to record. `checkpoint` says which bytes were scored and `suite` which protocol it is judged on; both
 * are optional because exploratory and failed runs are kept too, and an unranked result says why in `validation`.
 */
export const evaluationBodySchema = z.object({
  /** a project id or slug; left out, it is the project of the epoch in `source.epochUuid` */
  projectId: text(100).optional(),
  /** your id for it: sending the same result with the same uuid again is answered, not stored twice */
  uuid: text(100).optional(),
  suite: suiteRef.optional(),
  /** optional: what the evaluator observed, compared with the suite; complete and matching marks the result observed */
  evidence: evidenceSchema.optional(),
  checkpoint: checkpointSchema.optional(),
  /** the run and epoch the checkpoint came from, when it did */
  source: z
    .strictObject({
      trainingUuid: text(100).optional(),
      epochUuid: text(100).optional(),
      epoch: z.number().int().min(0).optional()
    })
    .optional(),
  status: z.enum(['completed', 'failed']).default('completed'),
  results: resultsSchema.default({}),
  /** samples scored per condition, as the evaluator observed */
  sampleCounts: z.record(z.string().max(200), z.number().int().min(0)).optional(),
  provenance: provenanceSchema.optional(),
  executedAt: z.coerce.date().optional(),
  /** the evaluation this one replaces, in the same project */
  supersedesId: z.string().regex(OBJECT_ID).optional()
}).refine(body => body.projectId !== undefined || body.source?.epochUuid !== undefined, {
  message: 'Say which project, or the epoch (source.epochUuid) whose project it is',
  path: ['projectId']
});
export type EvaluationBody = z.infer<typeof evaluationBodySchema>;

/** Copy a result recorded without a suite onto one: the two things it never carried are supplied here. */
export const promoteEvaluationBodySchema = z.object({
  /** the evaluation to copy: it is not changed */
  evaluationId: z.string().regex(OBJECT_ID),
  suite: suiteRef,
  checkpoint: checkpointSchema,
  /** samples scored per condition: a result recorded without a suite did not record them, so the person promoting says */
  sampleCounts: z.record(z.string().max(200), z.number().int().min(0))
});
export type PromoteEvaluationBody = z.infer<typeof promoteEvaluationBodySchema>;

/** How a list of evaluations is ordered: when the server stored them, when the writer says they ran, or by epoch. */
export const EVALUATION_SORT_FIELDS = ['receivedAt', 'executedAt', 'epoch'] as const;

export const listEvaluationsQuerySchema = z.object({
  ...paginationSchema,
  projectId: text(100).optional(),
  suite: suiteRef.optional(),
  checkpointKey: text(700).optional(),
  state: z.enum(VALIDATION_STATES).optional(),
  status: z.enum(['completed', 'failed']).optional(),
  /** only what came from this run (by id), or from the run with this uuid */
  trainingId: z.string().regex(OBJECT_ID).optional(),
  trainingUuid: text(100).optional(),
  /** only what came from this epoch of a run, or from any of these epochs (comma separated epoch uuids) */
  epoch: z.coerce.number().int().min(0).optional(),
  epochUuids: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((uuid) => uuid.trim()).filter(Boolean) : undefined)),
  sortBy: z.enum(EVALUATION_SORT_FIELDS).default('receivedAt'),
  order: sortOrderSchema('desc'),
  /** `results` carries each evaluation's results, which a list leaves out; use it with a small page */
  include: z.enum(['results']).optional()
});
export type ListEvaluationsQuery = z.infer<typeof listEvaluationsQuerySchema>;

export const evaluationUuidQuerySchema = z.object({ projectId: text(100) });

/** A public leaderboard is addressed by a concrete version, so a link keeps meaning one protocol. */
export const publicLeaderboardParamsSchema = z.object({
  slug: z.string().trim().regex(/^([a-z0-9][a-z0-9-]{0,62}[a-z0-9]|[a-z0-9])$/, 'Lowercase letters, digits and hyphens'),
  version: z.coerce.number().int().positive()
});

/** A badge names one checkpoint of one suite version; the key is URL-encoded because it holds `:`, `@` and `/`. */
export const publicBadgeParamsSchema = publicLeaderboardParamsSchema.extend({ checkpointKey: text(700) });
/** The project whose row the badge shows, by slug or id: two projects can each publish the same checkpoint. */
export const publicBadgeQuerySchema = z.object({ project: text(100) });

/** Leaderboards page selected summaries, never the underlying candidate pool. */
export const leaderboardPageQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
  limit: z.coerce.number().int().positive().max(100).default(100)
});
export type LeaderboardPageQuery = z.infer<typeof leaderboardPageQuerySchema>;

/** Rank recorded scores, including results without a suite, within the caller's normal project access. */
export const recordedLeaderboardQuerySchema = leaderboardPageQuerySchema.extend({
  verification: z.enum(['all', 'verified', 'unverified']).default('all'),
  metric: text(700).optional(),
  direction: z.enum(['max', 'min']).optional(),
  projectId: text(100).optional()
});
export type RecordedLeaderboardQuery = z.infer<typeof recordedLeaderboardQuerySchema>;

export const verifyEvaluationBodySchema = z.object({ verified: z.boolean() });
export type VerifyEvaluationBody = z.infer<typeof verifyEvaluationBodySchema>;

/**
 * A board's query: a page, and optionally only the results whose evidence the evaluator observed. Without it a
 * board mixes observed and attested (promoted) results, each marked; with it the pool, its counts and its ranks
 * are those of the observed results alone.
 */
export const leaderboardQuerySchema = leaderboardPageQuerySchema.extend({
  evidence: z.enum(['observed']).optional()
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const suiteLeaderboardQuerySchema = leaderboardQuerySchema.extend({
  unrankedPage: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1)
});
export type SuiteLeaderboardQuery = z.infer<typeof suiteLeaderboardQuerySchema>;

/** Why a manager of a suite takes a published result off its leaderboard: kept with the result, so it is never silent. */
export const hideEvaluationBodySchema = z.object({ reason: text(500) });
export type HideEvaluationBody = z.infer<typeof hideEvaluationBodySchema>;
