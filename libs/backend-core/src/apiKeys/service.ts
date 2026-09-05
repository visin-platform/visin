import { ApiKey, IApiKey } from './ApiKey';
import {
  decryptSecret,
  displayPrefix,
  encryptSecret,
  generateKey,
  parseKey,
  secretMatches
} from './crypto';
import type { ApiKeyScope, ApiKeySummary, ApiKeyVerification } from './types';

export interface CreateApiKeyInput {
  userId: string;
  userEmail: string;
  userName: string;
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: Date | null;
}

export interface CreatedApiKey {
  summary: ApiKeySummary;
  /** the full token — the only time it is returned without an explicit reveal */
  token: string;
}

const toSummary = (key: IApiKey): ApiKeySummary => ({
  id: String(key._id),
  name: key.name,
  prefix: displayPrefix(key.keyId),
  scopes: key.scopes,
  createdAt: key.createdAt.toISOString(),
  lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
  expiresAt: key.expiresAt?.toISOString() ?? null,
  revokedAt: key.revokedAt?.toISOString() ?? null
});

export const createApiKey = async (input: CreateApiKeyInput): Promise<CreatedApiKey> => {
  const { token, id, hash } = generateKey();
  const sealed = encryptSecret(token);

  const key = await ApiKey.create({
    userId: input.userId,
    userEmail: input.userEmail,
    userName: input.userName,
    name: input.name,
    keyId: id,
    hash,
    sealedCiphertext: sealed.ciphertext,
    sealedIv: sealed.iv,
    sealedTag: sealed.tag,
    scopes: input.scopes,
    expiresAt: input.expiresAt ?? undefined
  });

  return { summary: toSummary(key), token };
};

export const listApiKeys = async (userId: string): Promise<ApiKeySummary[]> => {
  const keys = await ApiKey.find({ userId }).sort({ createdAt: -1 });
  return keys.map(toSummary);
};

/**
 * Read a key back in the clear.
 *
 * Scoped to the owner by the query rather than by a check afterwards, so there
 * is no path where a mismatched userId still reaches the decrypt. Revoked keys
 * are still revealable — the owner may need to see which key they just turned
 * off.
 */
export const revealApiKey = async (userId: string, id: string): Promise<string | null> => {
  const key = await ApiKey.findOne({ _id: id, userId });
  if (!key) return null;

  const token = decryptSecret({
    ciphertext: key.sealedCiphertext,
    iv: key.sealedIv,
    tag: key.sealedTag
  });

  key.revealCount += 1;
  key.lastRevealedAt = new Date();
  await key.save();

  return token;
};

/** Revoking is a tombstone, not a delete: the record outlives the key. */
export const revokeApiKey = async (userId: string, id: string): Promise<ApiKeySummary | null> => {
  const key = await ApiKey.findOne({ _id: id, userId });
  if (!key) return null;

  if (!key.revokedAt) {
    key.revokedAt = new Date();
    await key.save();
  }

  return toSummary(key);
};

export const deleteApiKey = async (userId: string, id: string): Promise<boolean> => {
  const { deletedCount } = await ApiKey.deleteOne({ _id: id, userId });
  return deletedCount > 0;
};

/**
 * How stale `lastUsedAt` must be before it is worth a write.
 *
 * Same reasoning as vision-service's `apiTokenMiddleware`: this runs on every
 * request an assistant makes, and writing unconditionally turns every read into
 * a write for a field only the listing UI reads.
 */
const LAST_USED_STALE_MS = 60_000;

/**
 * Check a presented token.
 *
 * Every failure returns the same shape and the caller answers all of them with
 * one message: telling a client "no such key" rather than "wrong secret" would
 * confirm which half of a guess was right. The `rejection` field exists for the
 * server's own logs.
 *
 * The `lastUsedAt` write is fire-and-forget. It is a convenience for the
 * listing, and making every authenticated request wait on it would be a poor
 * trade — a failed bookkeeping write must never fail an otherwise valid
 * request.
 */
export const verifyApiKey = async (token: unknown): Promise<ApiKeyVerification> => {
  const parsed = parseKey(token);
  if (!parsed) return { ok: false, rejection: 'malformed' };

  const key = await ApiKey.findOne({ keyId: parsed.id });
  if (!key) return { ok: false, rejection: 'unknown' };
  if (key.revokedAt) return { ok: false, rejection: 'revoked' };
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
    return { ok: false, rejection: 'expired' };
  }
  if (!secretMatches(parsed.secret, key.hash)) {
    return { ok: false, rejection: 'bad-secret' };
  }

  const now = new Date();
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > LAST_USED_STALE_MS) {
    void ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: now } }).catch(() => {
      // Deliberately swallowed — see the note above.
    });
  }

  return {
    ok: true,
    userId: key.userId,
    userEmail: key.userEmail,
    userName: key.userName,
    keyId: String(key._id),
    label: key.name,
    scopes: key.scopes
  };
};
