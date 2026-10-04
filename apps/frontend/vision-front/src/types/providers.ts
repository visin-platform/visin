import { HUB, type HubCheckpoint, type HubData } from '../providers/huggingFace';

/**
 * The kinds of each place something can live, one list per concept. The same lists as vision-service's
 * `sourceRegistry.ts`, which the API enforces; here they key every registry (`components/evaluations/sources.ts`,
 * `checkpointForms.ts`, `components/project/storageProviders.ts`), so a kind added to a list does not compile until
 * each registry says how it reads. A store's own id and shapes are in `providers/<store>.ts`.
 */

/** Where a project keeps what is too big for a database row; `visin` is this deployment's own servers. */
export const STORAGE_PROVIDERS = ['visin', HUB] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/** Where a run's dataset came from. */
export const DATASET_SOURCES = ['visin', HUB, 'other'] as const;
export type DatasetSourceKind = (typeof DATASET_SOURCES)[number];

/** The stores a model can be linked from. */
export const MODEL_LINK_PROVIDERS = [HUB] as const;
export type ModelLinkProvider = (typeof MODEL_LINK_PROVIDERS)[number];

/** What a checkpoint an evaluation scored can be. */
export const CHECKPOINT_KINDS = [HUB, 'local'] as const;

/** What the data a suite pins, or an evaluator reports having read, can be. */
export const SUITE_DATA_KINDS = ['visin', HUB, 'external'] as const;
export type SuiteDataKind = (typeof SUITE_DATA_KINDS)[number];

/** A checkpoint an evaluation scored: held on a store, or outside Visin and named by the digest of its weights. */
export type Checkpoint = HubCheckpoint | { kind: 'local'; sha256: string; label: string };

/** What a Visin suite pins. */
export type SuiteData =
  | { kind: 'visin'; datasetId: string; archiveSha256: string }
  | HubData
  | { kind: 'external'; label: string; manifestSha256: string };
