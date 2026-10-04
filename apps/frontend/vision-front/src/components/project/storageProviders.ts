import type { ProjectStorage } from '../../types/Project';
import { STORAGE_PROVIDERS, type StorageProvider } from '../../types/providers';
import { HUB, hubStorageView } from '../../providers/huggingFace';

/**
 * What each storage provider is called and says to a person, and what it keeps beside the provider. The editor
 * draws whatever is here, so a new provider adds an entry and no branch to the editor.
 */
export interface StorageProviderView {
  label: string;
  /** one sentence on what a project on this provider can and cannot do */
  summary: string;
  /** what the provider keeps about a project beside its id (a Hub project's default namespace), one field each */
  settings?: { key: string; label: string; placeholder: string; helperText: string }[];
}

export const storageProviders: { [K in StorageProvider]: StorageProviderView } = {
  visin: {
    label: 'Visin (this server only)',
    summary: 'Nothing leaves this server, and runs that link Hub models or use Hub datasets are refused.'
  },
  [HUB]: hubStorageView
};

/** The providers to choose from, in the order the API lists them. */
export const storageChoices = STORAGE_PROVIDERS.map(provider => ({ provider, view: storageProviders[provider] }));

/** The storage after choosing `provider`: a setting is kept only where the new provider has it, since it means nothing elsewhere. */
export const switchProvider = (provider: StorageProvider, current: ProjectStorage): ProjectStorage => {
  const kept = Object.fromEntries(
    (storageProviders[provider].settings ?? []).flatMap(({ key }) => (current.settings?.[key] ? [[key, current.settings[key]]] : []))
  );
  return Object.keys(kept).length > 0 ? { provider, settings: kept } : { provider };
};

/** The storage with one setting changed; an empty value removes it, and a storage with no settings left has none. */
export const withSetting = (storage: ProjectStorage, key: string, value: string): ProjectStorage => {
  const { [key]: _removed, ...rest } = storage.settings ?? {};
  const settings = value.trim() ? { ...rest, [key]: value.trim() } : rest;
  return Object.keys(settings).length > 0 ? { provider: storage.provider, settings } : { provider: storage.provider };
};
