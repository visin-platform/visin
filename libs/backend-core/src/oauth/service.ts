import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { AuthorizationCode, IAuthorizationCode, OAuthClient, OAuthGrant, RefreshToken } from './models';
import type { ApiKeyScope } from '../apiKeys/types';

/** How long a user has between approving and the client exchanging the code. */
const CODE_TTL_MS = 60 * 1000;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** base64url of the SHA-256 digest, which is what PKCE `S256` specifies. */
const s256 = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export interface RegisterClientInput {
  clientName: string;
  redirectUris: string[];
}

export interface RegisteredClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

/**
 * Register a client, or hand back the one that is already registered.
 *
 * Clients re-register freely — the Claude app does it on every connect attempt
 * — and minting a fresh id each time would leave a user staring at three
 * identical "Claude" entries in their connected apps, only one of which any
 * given disconnect would cut off.
 *
 * Matching on the exact redirect URIs is what makes this safe. These are public
 * clients with no secret, so a `client_id` is an identifier rather than a
 * credential; anything presenting the same callback URL *is* the same
 * application, because that URL is where an authorization code gets delivered.
 * A different app cannot claim it without already controlling it.
 */
export const registerClient = async (input: RegisterClientInput): Promise<RegisteredClient> => {
  const redirectUris = [...input.redirectUris].sort();

  const existing = await OAuthClient.findOne({
    redirectUris: { $size: redirectUris.length, $all: redirectUris }
  });

  const client =
    existing ??
    (await OAuthClient.create({
      clientId: `vsn-client-${randomBytes(16).toString('hex')}`,
      clientName: input.clientName.slice(0, 200),
      redirectUris
    }));

  return {
    clientId: client.clientId,
    clientName: client.clientName,
    redirectUris: client.redirectUris
  };
};

export const findClient = (clientId: string) => OAuthClient.findOne({ clientId });

/**
 * Whether a client may be sent back to this URI.
 *
 * Exact string match, deliberately. Prefix or wildcard matching on redirect
 * URIs is the classic way an authorization code ends up delivered somewhere the
 * client never controlled.
 */
export const isRegisteredRedirect = (client: { redirectUris: string[] }, uri: string): boolean =>
  client.redirectUris.includes(uri);

export interface IssueCodeInput {
  clientId: string;
  userId: string;
  userEmail: string;
  userName: string;
  redirectUri: string;
  scopes: ApiKeyScope[];
  resource: string;
  codeChallenge: string;
}

export const issueAuthorizationCode = async (input: IssueCodeInput): Promise<string> => {
  const code = randomBytes(32).toString('base64url');

  await AuthorizationCode.create({
    ...input,
    code,
    expiresAt: new Date(Date.now() + CODE_TTL_MS)
  });

  return code;
};

export type CodeRejection =
  | 'unknown'
  | 'expired'
  | 'already-used'
  | 'client-mismatch'
  | 'redirect-mismatch'
  | 'pkce-failed';

export interface CodeRedemption {
  ok: boolean;
  rejection?: CodeRejection;
  code?: IAuthorizationCode;
}

/**
 * Exchange a code, once.
 *
 * The `usedAt` stamp is set by the same atomic update that fetches the code, so
 * two simultaneous exchanges cannot both succeed — a replayed code loses the
 * race rather than being caught by a check that ran a moment earlier.
 */
export const redeemAuthorizationCode = async (
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string
): Promise<CodeRedemption> => {
  const record = await AuthorizationCode.findOneAndUpdate(
    { code, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );

  if (!record) {
    // Either it never existed or it has already been redeemed; the client is
    // told the same thing for both.
    const existed = await AuthorizationCode.exists({ code });
    return { ok: false, rejection: existed ? 'already-used' : 'unknown' };
  }

  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, rejection: 'expired' };
  if (record.clientId !== clientId) return { ok: false, rejection: 'client-mismatch' };
  if (record.redirectUri !== redirectUri) return { ok: false, rejection: 'redirect-mismatch' };
  if (!constantTimeEquals(s256(codeVerifier), record.codeChallenge)) {
    return { ok: false, rejection: 'pkce-failed' };
  }

  return { ok: true, code: record };
};

export interface IssuedRefreshToken {
  token: string;
}

/**
 * Start a grant, replacing any the same client already held for this user.
 *
 * Reconnecting is a re-authorization, not a second connection: without this,
 * approving twice leaves two live grants, the newer scopes sitting beside the
 * older ones, and a disconnect that revokes only one of them.
 */
export const issueRefreshToken = async (input: {
  clientId: string;
  userId: string;
  scopes: ApiKeyScope[];
  resource: string;
}): Promise<IssuedRefreshToken> => {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const grantId = sha256(JSON.stringify([input.userId, input.clientId]));
  const generation = randomBytes(32).toString('hex');
  // Prepare history first. A crash here leaves an inert row, not a live token.
  await RefreshToken.create({ tokenHash, clientId: input.clientId, grantId, generation });
  // The single document is the authority. Concurrent reconnect/disconnect writes
  // take effect in their atomic write order; old refreshes cannot overwrite it.
  await OAuthGrant.findOneAndUpdate(
    { _id: grantId },
    {
      $set: { ...input, generation, currentTokenHash: tokenHash, grantedAt: new Date() },
      $unset: { revokedAt: 1, lastUsedAt: 1 }
    },
    { upsert: true, returnDocument: 'after' }
  );
  return { token };
};

export interface RefreshRedemption {
  ok: boolean;
  /** true when a retired token was presented again — treated as a compromise */
  reused?: boolean;
  userId?: string;
  scopes?: ApiKeyScope[];
  resource?: string;
  /** the replacement the client must store; the presented one is now dead */
  rotatedToken?: string;
}

/**
 * Exchange a refresh token for a new one, rotating as we go.
 *
 * Rotation matters because these are the long-lived half: an access token is
 * gone within the hour, but a refresh token that never changes is a permanent
 * credential for whoever obtains a copy. Each use retires the old token and
 * issues a fresh one, so a stolen copy stops working as soon as the legitimate
 * client refreshes.
 *
 * Reuse of an already-rotated token is treated as theft rather than as an
 * ordinary failure: the honest client and the thief now both hold tokens
 * descended from the same grant, and there is no way to tell which just called.
 * So the whole chain is revoked and the user reconnects — noisy, but the
 * alternative is leaving an attacker with working access.
 */
export const redeemRefreshToken = async (
  token: string,
  clientId: string
): Promise<RefreshRedemption> => {
  const tokenHash = sha256(token);
  const record = await RefreshToken.findOne(
    { tokenHash, clientId }, undefined, { readPreference: 'primary' }
  );
  // Legacy records without a grant generation must never gain authority.
  if (!record?.grantId || !record.generation) return { ok: false };

  const identity = { _id: record.grantId, generation: record.generation };
  const grant = await OAuthGrant.findOne(identity, undefined, { readPreference: 'primary' });
  if (!grant || grant.revokedAt) return { ok: false };
  if (grant.currentTokenHash !== tokenHash) return revokeReplayedGrant(identity);

  const rotated = randomBytes(32).toString('base64url');
  const rotatedHash = sha256(rotated);
  // Preparation failure leaves the old token usable. A prepared row is inert
  // unless the conditional grant update below commits.
  await RefreshToken.create({
    tokenHash: rotatedHash, clientId, grantId: record.grantId, generation: record.generation
  });
  const claimed = await OAuthGrant.findOneAndUpdate(
    { ...identity, currentTokenHash: tokenHash, revokedAt: { $exists: false } },
    { $set: { currentTokenHash: rotatedHash, lastUsedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!claimed) return revokeReplayedGrant(identity);

  return {
    ok: true,
    userId: claimed.userId,
    scopes: claimed.scopes,
    resource: claimed.resource,
    rotatedToken: rotated
  };
};

/** Never let replay from an older generation revoke a newly approved connection. */
const revokeReplayedGrant = async (identity: { _id: string; generation: string }): Promise<RefreshRedemption> => {
  await OAuthGrant.updateOne(
    { ...identity, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
  return { ok: false, reused: true };
};

/** Cut off an assistant: without a refresh token it can obtain nothing new. */
export const revokeRefreshTokensForUser = async (
  userId: string,
  clientId?: string
): Promise<number> => {
  const filter: Record<string, unknown> = { userId, revokedAt: { $exists: false } };
  if (clientId) filter.clientId = clientId;

  const result = await OAuthGrant.updateMany(filter, { $set: { revokedAt: new Date() } });
  return result.modifiedCount;
};

export interface Connection {
  id: string;
  clientId: string;
  clientName: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastRenewedAt: string | null;
  revokedAt: string | null;
}

/**
 * The assistants a user has connected.
 *
 * Read the authoritative grants, not prepared or retired token history. Each
 * client has one connection, even after many rotations or reauthorizations.
 */
export const listConnections = async (userId: string): Promise<Connection[]> => {
  const grants = await OAuthGrant.find({ userId }).sort({ grantedAt: -1 });
  const clients = await OAuthClient.find({ clientId: { $in: grants.map((grant) => grant.clientId) } });
  const nameById = new Map(clients.map((client) => [client.clientId, client.clientName]));

  return grants.map((grant) => ({
    id: String(grant._id),
    clientId: grant.clientId,
    clientName: nameById.get(grant.clientId) ?? 'Unknown app',
    scopes: grant.scopes,
    createdAt: grant.grantedAt.toISOString(),
    // Set when the refresh token is exchanged, not when a tool runs — access
    // tokens are validated statelessly, so the server never sees ordinary use.
    lastRenewedAt: grant.lastUsedAt?.toISOString() ?? null,
    revokedAt: grant.revokedAt?.toISOString() ?? null
  }));
};
