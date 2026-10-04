import { hubSummary } from '../services/hubService';
import { HUB, HUB_NAME, hubSourcePaths, hubSourceSchema, hubSourceView, type HubSource } from './huggingFace';

/**
 * The stores a dataset can be kept on besides this deployment's own. One list of them, and a registry keyed by it, so
 * a store added to the list is a compile error until the registry says what it means, and no service branches on a
 * provider's id. A store brings its own module (`huggingFace.ts`), its id here, one entry in the registry, and one
 * variant in `datasetSourceSchema`.
 */
export const DATASET_SOURCE_PROVIDERS = [HUB] as const;
export type DatasetSourceProvider = (typeof DATASET_SOURCE_PROVIDERS)[number];

/** Where the bytes are when they are not (only) in file-service: a pointer, never a copy. */
export type DatasetSource = HubSource;

export const datasetSourceSchema = hubSourceSchema;

/** The stored fields each store adds to a dataset's source (a Mongoose schema definition); a new store spreads its own. */
export const DATASET_SOURCE_PATHS = { ...hubSourcePaths };

export interface SourceProvider<S extends DatasetSource> {
  name: string;
  /** what a client may see of the pointer */
  view(source: S): Record<string, unknown> & { revision: string };
  /** what the store says about the dataset: a summary of its files and tags */
  info(source: S): Promise<unknown>;
}

export const sourceProviders: { [K in DatasetSourceProvider]: SourceProvider<Extract<DatasetSource, { provider: K }>> } = {
  [HUB]: { name: HUB_NAME, view: hubSourceView, info: hubSummary }
};

const providerOf = (source: DatasetSource) => sourceProviders[source.provider] as SourceProvider<DatasetSource>;

export const sourceView = (source: DatasetSource) => providerOf(source).view(source);
export const sourceInfo = (source: DatasetSource) => providerOf(source).info(source);
export const sourceName = (source: DatasetSource) => providerOf(source).name;
