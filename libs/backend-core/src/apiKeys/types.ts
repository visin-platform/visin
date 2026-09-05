/**
 * API keys let a non-browser client — an MCP server driving an assistant, a
 * script, a CI job — act as a user without going through a sign-in flow.
 *
 * They are deliberately narrower than a session. A session is a person at a
 * keyboard who can see what they are doing; a key is handed to software that
 * acts on its own, so a key carries explicit scopes and every request made with
 * it is gated on them.
 *
 * Distinct from vision-service's `ApiToken`, which is a different credential
 * for a different job: that one is minted per project for the training pipeline
 * to POST epochs and benchmarks with, carries no scopes, and is pinned to one
 * project. This one identifies a *user* and is scoped by domain.
 */

/**
 * Everything a key may be granted, one pair per backend domain.
 *
 * Read and write are separate because the interesting key is the read-only one:
 * an assistant that can answer questions about a training run without being
 * able to rename or delete it is a much easier thing to hand out.
 */
export const API_KEY_SCOPES = [
  /** projects, trainings, epochs, test results, benchmarks, comparisons */
  'vision:read',
  'vision:write',
  /** datasets, dataset images, image categories, dataset analyses */
  'dataset:read',
  'dataset:write',
  /** labelling bundles, jobs, tasks */
  'label:read',
  'label:write',
  /**
   * Written analysis attached to a project or a run.
   *
   * Separate from `vision:write` on purpose. The grant most people want for an
   * assistant is "read my experiments, record what you conclude" — and folding
   * that into `vision:write` would hand the same assistant the ability to
   * rename projects and retag runs, which is a different and larger thing to
   * agree to.
   */
  'analysis:read',
  'analysis:write'
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const isApiKeyScope = (value: unknown): value is ApiKeyScope =>
  typeof value === 'string' && (API_KEY_SCOPES as readonly string[]).includes(value);

/**
 * A backend domain, and the two scopes that go with it.
 *
 * The domain is what a service declares when it mounts `apiKeyAuth`; the
 * required scope for a given request is derived from it and the HTTP method.
 */
export type ApiKeyDomain = 'vision' | 'dataset' | 'label' | 'analysis';

export const readScope = (domain: ApiKeyDomain): ApiKeyScope => `${domain}:read`;
export const writeScope = (domain: ApiKeyDomain): ApiKeyScope => `${domain}:write`;

/** A key as the API hands it back — never including the secret. */
export interface ApiKeySummary {
  id: string;
  name: string;
  /** the public half, shown in listings so a key is identifiable at a glance */
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

/**
 * Why a presented key was refused.
 *
 * Kept out of the HTTP response deliberately — see `verifyApiKey`. It exists
 * for the server's own logs, where the distinction is the difference between
 * "someone is guessing" and "this key expired an hour ago".
 */
export type ApiKeyRejection = 'malformed' | 'unknown' | 'revoked' | 'expired' | 'bad-secret';

export interface ApiKeyVerification {
  ok: boolean;
  rejection?: ApiKeyRejection;
  userId?: string;
  userEmail?: string;
  userName?: string;
  /** the key document's id — stable for the life of the key, unlike the token */
  keyId?: string;
  /** what the owner called this key, for a log line a person can read */
  label?: string;
  scopes?: ApiKeyScope[];
}
