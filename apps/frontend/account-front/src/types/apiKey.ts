/**
 * A key as the API hands it back. Never carries the secret — the token is
 * returned exactly twice: once on creation, and once per explicit reveal.
 */
export interface ApiKey {
  id: string;
  name: string;
  /** the public half, enough to tell two keys apart and not enough to use one */
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export const API_KEY_SCOPES = [
  'vision:read',
  'vision:write',
  'dataset:read',
  'dataset:write',
  'label:read',
  'label:write'
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/**
 * What each permission actually lets a key do, in the terms someone granting it
 * would think in.
 *
 * Worth spelling out rather than showing the raw scope string: "vision:write"
 * does not tell anyone that it cannot record a training result, which is the
 * single most likely thing they would assume it covers.
 */
export const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, { label: string; detail: string }> = {
  'vision:read': {
    label: 'Read training runs',
    detail: 'Projects, runs, epochs, test results and benchmarks you can already see.'
  },
  'vision:write': {
    label: 'Change projects and runs',
    detail: 'Create projects, rename and retag runs. Cannot record epochs or results — those come from the training pipeline.'
  },
  'dataset:read': {
    label: 'Read datasets',
    detail: 'Datasets, their metadata and their label vocabulary.'
  },
  'dataset:write': {
    label: 'Change datasets',
    detail: 'Create and edit datasets, images and categories.'
  },
  'label:read': { label: 'Read labelling jobs', detail: 'Labelling jobs, tasks and progress.' },
  'label:write': { label: 'Change labelling jobs', detail: 'Create and edit labelling jobs.' }
};

/** A key's state, which is not a stored field — it is derived from two dates. */
export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

export const statusOf = (key: ApiKey): ApiKeyStatus => {
  if (key.revokedAt) return 'revoked';
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
};

export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiKeyScope[];
  expiresInDays?: number;
}

export interface CreatedApiKey {
  key: ApiKey;
  /** shown once, then unrecoverable except through an explicit reveal */
  token: string;
}
