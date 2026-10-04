import { ConflictError } from '@visin/backend-core';
import type { IProject } from '../models/Project';
import type { SuiteProtocol } from '../validation/suiteSchemas';
import type { Evidence } from '../validation/evaluationSchemas';
import {
  HUB,
  HUB_NAME,
  hubCheckpointKey,
  hubCheckpointView,
  hubDatasetMismatch,
  hubDatasetView,
  hubLinkCheckpoint,
  hubModelLinkIdentity,
  hubModelLinkLabel,
  hubModelLinkPaths,
  type HubCheckpoint,
  type HubModelLink,
  type PublicHubCheckpoint,
  type PublicHubData
} from './huggingFace';

/**
 * What the platform does with each kind of place something can live: a project's storage, a checkpoint, a model linked
 * to a run, the data a suite pins, a training's dataset.
 *
 * Each concept has one list of its kinds, and a registry keyed by that list, so adding a kind to its list is a compile
 * error until the registry says what it means, and no service branches on a provider's id. A provider's specifics are
 * in its own module (`huggingFace.ts`); a new store adds its own module, its id to the lists below, and one entry to
 * each registry. The schemas that accept it are the variants of the unions in `validation/`, and the test in
 * `sourceRegistry.test.ts` fails until the two agree.
 */

// ---- the kinds of each concept

/** Where a project keeps what is too big for a database row; `visin` is this deployment's own servers. */
export const STORAGE_PROVIDERS = ['visin', HUB] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/** Where a training's dataset came from. */
export const DATASET_SOURCES = ['visin', HUB, 'other'] as const;
export type DatasetSourceKind = (typeof DATASET_SOURCES)[number];

/** The stores a model can be linked from. */
export const MODEL_LINK_PROVIDERS = [HUB] as const;
export type ModelLinkProvider = (typeof MODEL_LINK_PROVIDERS)[number];

/** What a checkpoint an evaluation scored can be. */
export const CHECKPOINT_KINDS = [HUB, 'local'] as const;
export type CheckpointKind = (typeof CHECKPOINT_KINDS)[number];

/** What the data a suite pins, or an evaluator reports having read, can be. */
export const SUITE_DATA_KINDS = ['visin', HUB, 'external'] as const;
export type SuiteDataKind = (typeof SUITE_DATA_KINDS)[number];

// ---- project storage

/** How each storage is named to a person. */
export const storageProviders: { [K in StorageProvider]: { name: string } } = {
  visin: { name: 'Visin' },
  [HUB]: { name: HUB_NAME }
};

/** The project storage a kind needs, and the words completing "Switch its storage to … to <what>". */
export interface StorageNeed {
  storage: StorageProvider;
  what: string;
}

/**
 * A project's storage setting is what makes a pointer to another store real: a `visin` project (the default) keeps its
 * data on this deployment's own servers and refuses a run that points anywhere else. `needed` is the provider the
 * pointer requires.
 */
export function requireStorage(project: Pick<IProject, 'storage'> | null | undefined, needed: StorageProvider, what: string): void {
  const current: StorageProvider = project?.storage?.provider ?? 'visin';
  if (current !== needed) {
    throw new ConflictError(
      `This project keeps its files on ${storageProviders[current].name}. Switch its storage to ${storageProviders[needed].name} in the project settings to ${what}.`
    );
  }
}

const requireNeed = (project: Pick<IProject, 'storage'> | null | undefined, needs: StorageNeed | null | undefined): void => {
  if (needs) requireStorage(project, needs.storage, needs.what);
};

// ---- checkpoints

export interface LocalCheckpoint {
  kind: 'local';
  sha256: string;
  label: string;
}
/** A checkpoint an evaluation scored: held on a store, or outside Visin and named by the digest of its weights. */
export type Checkpoint = HubCheckpoint | LocalCheckpoint;

export type PublicCheckpoint = PublicHubCheckpoint | { kind: 'local'; label: string; sha256: string };

export interface CheckpointSource<C extends Checkpoint> {
  /** what makes two evaluations the same model */
  key(checkpoint: C): string;
  /** what an anonymous visitor may see of it */
  publicView(checkpoint: C): PublicCheckpoint;
  /** storage the project must have to record this kind; absent when any project may */
  needs?: StorageNeed;
}

export const checkpointSources: { [K in CheckpointKind]: CheckpointSource<Extract<Checkpoint, { kind: K }>> } = {
  [HUB]: { key: hubCheckpointKey, publicView: hubCheckpointView, needs: { storage: HUB, what: 'record evaluations of Hub models' } },
  // A local checkpoint is the digest of the weights, so a rename or a move changes nothing.
  local: {
    key: (checkpoint) => `sha256:${checkpoint.sha256}`,
    publicView: (checkpoint) => ({ kind: 'local', label: checkpoint.label, sha256: checkpoint.sha256 })
  }
};

const checkpointSource = (checkpoint: Checkpoint) => checkpointSources[checkpoint.kind] as CheckpointSource<Checkpoint>;

export const checkpointKey = (checkpoint: Checkpoint): string => checkpointSource(checkpoint).key(checkpoint);

export const publicCheckpoint = (checkpoint: Checkpoint | undefined): PublicCheckpoint | undefined =>
  checkpoint && checkpointSource(checkpoint).publicView(checkpoint);

/** Refuses a checkpoint the project's storage cannot hold; kinds that need nothing always pass. */
export function requireCheckpointStorage(project: Pick<IProject, 'storage'> | null | undefined, checkpoint: Checkpoint | undefined): void {
  requireNeed(project, checkpoint && checkpointSource(checkpoint).needs);
}

// ---- a model linked to a run

/** A pointer to a model kept on a store, pinned to the exact revision a run produced. */
export type ModelLink = HubModelLink;

export interface ModelLinkSource<L extends ModelLink> {
  /** the filter that finds a link to the same bytes, so linking twice changes nothing */
  identity(link: L): Record<string, unknown>;
  /** how it is named to a person, and what a search matches it by */
  label(link: L): string;
  /** the checkpoint an evaluation of this model scores: how a linked model joins the evaluations of its bytes */
  checkpoint(link: L): Checkpoint;
  /** storage the project must have to link this kind */
  needs: StorageNeed;
}

export const modelLinkSources: { [K in ModelLinkProvider]: ModelLinkSource<Extract<ModelLink, { provider: K }>> } = {
  [HUB]: { identity: hubModelLinkIdentity, label: hubModelLinkLabel, checkpoint: hubLinkCheckpoint, needs: { storage: HUB, what: 'link Hub models' } }
};

/** The stored fields each provider adds to a model link (a Mongoose schema definition); a new provider spreads its own. */
export const MODEL_LINK_PATHS = { ...hubModelLinkPaths };

const modelLinkSource = (link: ModelLink) => modelLinkSources[link.provider] as ModelLinkSource<ModelLink>;

export const modelLinkIdentity = (link: ModelLink): Record<string, unknown> => modelLinkSource(link).identity(link);

export const modelLinkLabel = (link: ModelLink): string => modelLinkSource(link).label(link);

/** Whether two links point at the same bytes. */
export const sameModelLink = (a: ModelLink, b: ModelLink): boolean =>
  JSON.stringify(modelLinkIdentity(a)) === JSON.stringify(modelLinkIdentity(b));

/** The canonical key of the checkpoint a linked model stands for: how it is matched with evaluations. */
export const modelLinkKey = (link: ModelLink): string => checkpointKey(modelLinkSource(link).checkpoint(link));

/** Refuses a link the project's storage cannot hold. */
export function requireModelLinkStorage(project: Pick<IProject, 'storage'> | null | undefined, link: ModelLink): void {
  requireNeed(project, modelLinkSource(link).needs);
}

// ---- the data a suite pins

type SuiteData = SuiteProtocol['data'];
type ObservedData = NonNullable<Evidence['data']>;
export type PublicSuiteData = PublicHubData | { kind: 'external'; label: string } | { kind: 'visin' };

export interface DataSource<D extends SuiteData> {
  /** the field in which what the evaluator read differs from what the suite pins, or `undefined` when it is the same */
  mismatch(declared: D, observed: Extract<ObservedData, { kind: D['kind'] }>): string | undefined;
  /** what a public page may say of it */
  publicView(declared: D): PublicSuiteData;
}

export const dataSources: { [K in SuiteDataKind]: DataSource<Extract<SuiteData, { kind: K }>> } = {
  [HUB]: { mismatch: hubDatasetMismatch, publicView: hubDatasetView },
  external: {
    mismatch: (declared, observed) => (declared.manifestSha256 === observed.manifestSha256 ? undefined : 'manifestSha256'),
    publicView: (data) => ({ kind: 'external', label: data.label })
  },
  visin: {
    mismatch: (declared, observed) => (declared.archiveSha256 === observed.archiveSha256 ? undefined : 'archiveSha256'),
    // A Visin dataset's id and digest are this deployment's, not the reader's: say only what kind of data it is.
    publicView: () => ({ kind: 'visin' })
  }
};

/** The field in which observed data differs from a suite's data; a different kind of data differs in `kind`. */
export function dataMismatch(declared: SuiteData, observed: ObservedData): string | undefined {
  if (declared.kind !== observed.kind) return 'kind';
  const source = dataSources[declared.kind] as DataSource<SuiteData>;
  return source.mismatch(declared, observed as Extract<ObservedData, { kind: SuiteData['kind'] }>);
}

export const publicSuiteData = (data: SuiteData): PublicSuiteData => (dataSources[data.kind] as DataSource<SuiteData>).publicView(data);

// ---- a training's dataset

/** The storage a training needs to use a dataset of each source; `visin` and `other` datasets need none. */
export const datasetSources: { [K in DatasetSourceKind]: { needs?: StorageNeed } } = {
  visin: {},
  [HUB]: { needs: { storage: HUB, what: 'train on datasets from the Hub' } },
  other: {}
};

export function requireDatasetStorage(project: Pick<IProject, 'storage'> | null | undefined, dataset: { source: DatasetSourceKind } | null | undefined): void {
  requireNeed(project, dataset && datasetSources[dataset.source].needs);
}
