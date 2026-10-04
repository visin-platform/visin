import { z } from '@visin/backend-core';
import { HF_REPO_PATTERN, hubModelLinkSchema, hubRepoSchema, hubStorageSchema } from '../services/huggingFace';

/**
 * Where a project keeps what is too big for a database row. `visin` keeps every byte on this deployment's own servers
 * and refuses a run's references to anywhere else (Hub models, and datasets named after a store); another store lets
 * runs point at it, and brings the settings only it understands (`settings`), validated by its own schema.
 */
export const projectStorageSchema = z.discriminatedUnion('provider', [z.strictObject({ provider: z.literal('visin') }), hubStorageSchema]);
export type ProjectStorageInput = z.infer<typeof projectStorageSchema>;

/**
 * A pointer to bytes that live elsewhere, pinned to the exact commit a run used. One variant per store a model can be
 * linked from (`MODEL_LINK_PROVIDERS`); each says what it takes to name a revision.
 */
export const modelLinkSchema = z.discriminatedUnion('provider', [hubModelLinkSchema]);
export type ModelLinkInput = z.infer<typeof modelLinkSchema>;

/** What a model card is written for: the run, and optionally which checkpoint of it. */
export const modelCardQuerySchema = z.object({
  /** the Hub repo the card will sit in; names the card */
  repo: hubRepoSchema.optional(),
  /** the epoch the checkpoint came from; the latest reported when absent */
  epoch: z.coerce.number().int().min(0).optional()
});
export type ModelCardQuery = z.infer<typeof modelCardQuerySchema>;

/** The demo Space of a linked model: its repo id on the Hub, or `null` to unlink it. */
export const modelDemoBodySchema = z.object({
  space: z.string().regex(HF_REPO_PATTERN, 'Expected a Space id like "org/name"').nullable()
});
export type ModelDemoBody = z.infer<typeof modelDemoBodySchema>;
