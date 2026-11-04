import { decryptSecret, encryptSecret, isEncryptionConfigured, logger } from '@visin/backend-core';
import { ProviderKey } from '../models/ProviderKey';
import type { ProviderId } from './providers';

/**
 * Provider keys an administrator saves in the page, one per provider for the whole deployment, encrypted with
 * the same `API_KEY_ENCRYPTION_SECRET` as the platform's own API keys. The record has an owner so a user's own
 * key could sit beside it later; only the deployment's exists.
 */
const OWNER = 'deployment';
const TTL_MS = 2000;

interface Stored {
  ciphertext: string;
  iv: string;
  tag: string;
  hint: string;
  /** Decrypted once when read, not on every use: the worker asks every second. Null when it does not decrypt. */
  key: string | null;
}
const cache = new Map<ProviderId, { at: number; doc: Stored | null }>();
/** Records already reported as not decrypting, so a broken one is logged once rather than every second. */
const reported = new Set<string>();

function decrypt(provider: ProviderId, sealed: { ciphertext: string; iv: string; tag: string }): string | null {
  if (!isEncryptionConfigured()) return null;
  try {
    return decryptSecret(sealed);
  } catch {
    // A record that no longer decrypts (the secret was changed, or it was tampered with) is not a key.
    if (!reported.has(sealed.ciphertext)) {
      reported.add(sealed.ciphertext);
      logger.error('A saved assistant key could not be decrypted', { provider });
    }
    return null;
  }
}

export function resetProviderKeyCache(): void {
  // What was reported stays reported: a replaced key is a new ciphertext, and gets its own report.
  cache.clear();
}

async function stored(provider: ProviderId): Promise<Stored | null> {
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.doc;
  const found = await ProviderKey.findOne({ owner: OWNER, provider }).lean();
  const doc = found
    ? {
        ciphertext: found.ciphertext,
        iv: found.iv,
        tag: found.tag,
        hint: found.hint || '',
        key: decrypt(provider, found)
      }
    : null;
  cache.set(provider, { at: Date.now(), doc });
  return doc;
}

export interface ResolvedKey {
  key: string;
}

/**
 * What the provider is asked with: the key an administrator saved, decrypted. Null where there is none, or where
 * the saved one no longer decrypts. Keys are saved in the page only; there is no environment alternative.
 */
export async function resolveProviderKey(provider: ProviderId): Promise<ResolvedKey | null> {
  const doc = await stored(provider);
  return doc?.key ? { key: doc.key } : null;
}

export interface KeyStatus {
  configured: boolean;
  /** The last characters of the saved key, enough to tell which one it is and not enough to use it. */
  hint: string | null;
}

export async function keyStatus(provider: ProviderId): Promise<KeyStatus> {
  const resolved = await resolveProviderKey(provider);
  if (!resolved) return { configured: false, hint: null };
  return { configured: true, hint: (await stored(provider))?.hint ?? null };
}

export async function saveProviderKey(provider: ProviderId, key: string, userId: string): Promise<void> {
  const sealed = encryptSecret(key);
  const hint = key.slice(-4);
  await ProviderKey.updateOne(
    { owner: OWNER, provider },
    { $set: { ...sealed, hint, updatedBy: userId } },
    { upsert: true }
  );
  cache.set(provider, { at: Date.now(), doc: { ...sealed, hint, key } });
}

export async function removeProviderKey(provider: ProviderId): Promise<void> {
  await ProviderKey.deleteOne({ owner: OWNER, provider });
  cache.set(provider, { at: Date.now(), doc: null });
}
