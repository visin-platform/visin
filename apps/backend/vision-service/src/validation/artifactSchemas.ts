import { z } from '@visin/backend-core';

/** A Hub commit is a full SHA-1: a branch name moves, so it is never accepted as a revision. */
export const HF_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
/** `namespace/name`, as the Hub spells a repo id. */
export const HF_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
/** The user or organisation part of a repo id, on its own. */
export const HF_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;

export const STORAGE_PROVIDERS = ['visin', 'hf'] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/**
 * Where a project keeps what is too big for a database row. `visin` keeps every
 * byte on this deployment's own servers and refuses a run's references to anywhere else
 * (Hub models, and datasets named as `hf`);
 * `hf` lets runs point at Hugging Face Hub repos. `hfNamespace` is only the
 * default owner for repos a pipeline creates.
 */
export const projectStorageSchema = z.object({
  provider: z.enum(STORAGE_PROVIDERS),
  hfNamespace: z.string().regex(HF_NAMESPACE_PATTERN, 'Not a valid Hugging Face user or organisation').optional()
});

/**
 * A pointer to bytes that live elsewhere, pinned to the exact commit a run used.
 * Only models on the Hub exist so far; `provider` and `kind` widen as datasets
 * and other stores arrive.
 */
export const artifactRefSchema = z.object({
  provider: z.literal('hf').default('hf'),
  kind: z.literal('model').default('model'),
  repo: z.string().regex(HF_REPO_PATTERN, 'Expected a repo id like "org/name"'),
  revision: z
    .string()
    .trim()
    .transform(value => value.toLowerCase())
    .refine(value => HF_COMMIT_PATTERN.test(value), 'Expected the full 40-character commit hash, not a branch or tag'),
  /** a file or folder inside the repo, when the model is not the whole of it */
  path: z
    .string()
    .max(500)
    .refine(value => !value.startsWith('/') && !value.split('/').includes('..'), 'Path must stay inside the repo')
    .optional(),
  /** the epoch this checkpoint came from */
  epoch: z.number().int().min(0).optional()
});
export type ArtifactRefInput = z.infer<typeof artifactRefSchema>;

/** What a model card is written for: the run, and optionally which checkpoint of it. */
export const modelCardQuerySchema = z.object({
  /** the Hub repo the card will sit in; names the card */
  repo: z.string().regex(HF_REPO_PATTERN, 'Expected a repo id like "org/name"').optional(),
  /** the epoch the checkpoint came from; the latest reported when absent */
  epoch: z.coerce.number().int().min(0).optional()
});
export type ModelCardQuery = z.infer<typeof modelCardQuerySchema>;

/** The demo Space of a linked model: its repo id on the Hub, or `null` to unlink it. */
export const modelDemoBodySchema = z.object({
  space: z.string().regex(HF_REPO_PATTERN, 'Expected a Space id like "org/name"').nullable()
});
export type ModelDemoBody = z.infer<typeof modelDemoBodySchema>;
