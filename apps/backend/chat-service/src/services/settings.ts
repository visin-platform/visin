import { logger } from '@visin/backend-core';
import mongoose from 'mongoose';
import { Settings } from '../models/Settings';
import { keyStatus, resetProviderKeyCache, resolveProviderKey } from './keys';
import {
  ADAPTERS,
  PROVIDERS,
  PROVIDER_IDS,
  isProviderId,
  withTiers,
  type ProviderId,
  type ProviderModel
} from './providers';

export type { ProviderModel };

const KEY = 'assistant';
/** An admin's change reaches every replica within this long. */
const SETTINGS_TTL_MS = 2000;
const MODELS_TTL_MS = 10 * 60 * 1000;

/** What each person may use a day until an administrator sets it. A question reserves up to RESERVATION of it. */
export const DEFAULT_DAILY_TOKEN_LIMIT = 800_000;
/** A ceiling on what can be typed, so a slip of a zero cannot make the limit meaningless. */
export const MAX_DAILY_TOKEN_LIMIT = 1_000_000_000;

export interface AssistantSettings {
  enabled: boolean;
  provider: ProviderId;
  /** The provider's model id. Empty until one is chosen. */
  model: string;
  /** Tokens one person may use a day, counting every question's reservation until its answer is in. */
  dailyTokenLimit: number;
  /** Where these came from: what an admin saved, or the defaults until one does. */
  source: 'admin' | 'default';
}

type Saved = Omit<AssistantSettings, 'source'>;
let stored: { at: number; doc: Saved | null } | undefined;
const models = new Map<ProviderId, { at: number; choices: ModelChoices }>();
/** A listing under way, which callers asking at the same moment share. */
const listing = new Map<ProviderId, Promise<ModelChoices | null>>();

/** For tests, and after a change made elsewhere. */
export function resetAssistantSettingsCache(): void {
  stored = undefined;
  models.clear();
  listing.clear();
  resetProviderKeyCache();
}

/** A new or removed key changes which models the provider offers. */
export function forgetProviderModels(provider: ProviderId): void {
  models.delete(provider);
  listing.delete(provider);
}

async function savedSettings() {
  if (stored && Date.now() - stored.at < SETTINGS_TTL_MS) return stored.doc;
  const found = await Settings.findById(KEY).lean();
  stored = {
    at: Date.now(),
    doc: found
      ? {
          enabled: found.enabled,
          provider: isProviderId(found.provider) ? found.provider : 'anthropic',
          model: found.model || '',
          dailyTokenLimit: found.dailyTokenLimit || DEFAULT_DAILY_TOKEN_LIMIT
        }
      : null
  };
  return stored.doc;
}

/**
 * Whether the analyst is on, with which provider and model: what an administrator saved in Account. Until they
 * save, it counts as on, with whichever provider already has a key (the first, where several do) and no model,
 * so nothing answers until a model is chosen from that provider's own list. None of this is set in the environment.
 */
export async function assistantSettings(): Promise<AssistantSettings> {
  const doc = await savedSettings();
  if (doc) return { ...doc, source: 'admin' };
  for (const provider of PROVIDER_IDS) {
    if ((await keyStatus(provider)).configured)
      return { enabled: true, provider, model: '', dailyTokenLimit: DEFAULT_DAILY_TOKEN_LIMIT, source: 'default' };
  }
  return {
    enabled: true,
    provider: PROVIDER_IDS[0],
    model: '',
    dailyTokenLimit: DEFAULT_DAILY_TOKEN_LIMIT,
    source: 'default'
  };
}

/**
 * What only the server's operator can provide: neither is something to type into a page. (The provider key is
 * not here: an administrator saves it in the page.)
 */
export function missingServerSettings(): string[] {
  return ['API_KEY_ENCRYPTION_SECRET', 'MCP_INTERNAL_URL'].filter((name) => !process.env[name]);
}

export async function assistantStatus() {
  const settings = await assistantSettings();
  const missing = missingServerSettings();
  const key = await keyStatus(settings.provider);
  return {
    settings,
    missing,
    key,
    ready: settings.enabled && Boolean(settings.model) && key.configured && missing.length === 0
  };
}

/** Every provider the page offers, and whether it has a saved key. Never the key. */
export async function providerCatalog() {
  return Promise.all(
    PROVIDER_IDS.map(async (id) => {
      const status = await keyStatus(id);
      return {
        id,
        name: PROVIDERS[id].name,
        keyConfigured: status.configured,
        keyHint: status.hint
      };
    })
  );
}

export async function saveAssistantSettings(input: Saved, userId: string): Promise<void> {
  await Settings.updateOne({ _id: KEY }, { $set: { ...input, updatedBy: userId } }, { upsert: true });
  stored = { at: Date.now(), doc: { ...input } };
}

/** The platform administrator role, read from the account itself on the primary, as the session check does. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!/^[a-f\d]{24}$/i.test(userId)) return false;
  const account = await mongoose.connection
    .collection('users')
    .findOne(
      { _id: new mongoose.Types.ObjectId(userId), roles: 'admin' },
      { projection: { _id: 1 }, readPreference: 'primary', maxTimeMS: 3000 }
    );
  return account !== null;
}

export interface ModelChoices {
  /** Newest first, with the model standing for each plain kind marked by its tier. */
  models: ProviderModel[];
  /** The one to start with, or null where the provider offers none of the usual kinds. */
  recommended: string | null;
}

/**
 * The chat models the provider offers this server's key, and which to start with. Null where they cannot be
 * listed (no key, provider down): nothing can then be chosen, and the page says why. Callers asking at the same
 * moment share one request to the provider.
 */
export async function providerModelChoices(provider: ProviderId): Promise<ModelChoices | null> {
  const resolved = await resolveProviderKey(provider);
  if (!resolved) return null;
  const cached = models.get(provider);
  if (cached && Date.now() - cached.at < MODELS_TTL_MS) return cached.choices;
  let pending = listing.get(provider);
  if (!pending) {
    // Only the current listing may fill the cache: one started with a key that has since been replaced (and
    // forgotten) finishes for its own caller, but must not leave that key's models behind for everyone else.
    const self: { listing?: Promise<ModelChoices | null> } = {};
    self.listing = (async (): Promise<ModelChoices | null> => {
      try {
        const list = await ADAPTERS[provider].listModels(resolved.key);
        if (!list) return null;
        const choices = withTiers(provider, list);
        if (listing.get(provider) === self.listing) models.set(provider, { at: Date.now(), choices });
        return choices;
      } catch (error) {
        // The key is never in the message, and a provider outage is not the admin's mistake.
        logger.warn('Could not list assistant models', {
          provider,
          error: error instanceof Error ? error.message : 'Unknown'
        });
        return null;
      } finally {
        if (listing.get(provider) === self.listing) listing.delete(provider);
      }
    })();
    listing.set(provider, self.listing);
    pending = self.listing;
  }
  return pending;
}

/** Just the models, for checking a choice against them. */
export async function providerModels(provider: ProviderId): Promise<ProviderModel[] | null> {
  return (await providerModelChoices(provider))?.models ?? null;
}
