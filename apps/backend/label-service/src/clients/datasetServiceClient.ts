import {
  requireEnv,
  fetchWithTimeout,
  BadGatewayError,
  NotFoundError,
  TRANSFER_FETCH_TIMEOUT_MS,
  type Permission,
  type ResourceOwner
} from '@visin/backend-core';

/**
 * dataset-service's internal API. Datasets — the zips and the images imported
 * out of them — live there; label-service reads them to build a job's tasks and
 * claims them so they cannot be deleted while a job shows their files.
 */

export interface DatasetSummary {
  _id: string;
  name: string;
  description?: string;
  owner: ResourceOwner;
  visibility: 'private' | 'public';
  groups: { name: string; images: number; jsons: number }[];
  imageCount: number;
  importStatus?: string;
}

export interface DatasetItem {
  _id: string;
  group: string;
  path: string;
  stem: string;
  variant?: string;
  kind: 'image' | 'json';
  fileId?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

export interface JsonField {
  field: string;
  values: { value: string; count: number }[];
}

export interface ManifestRow {
  stem: string;
  attributes: Record<string, string>;
}

const SERVICE = 'label-service';

const baseUrl = (): string => requireEnv('DATASET_SERVICE_URL').replace(/\/$/, '');

const headers = (): Record<string, string> => ({
  'x-internal-token': requireEnv('INTERNAL_SERVICE_TOKEN'),
  'x-service-id': SERVICE
});

const call = async <T>(method: string, path: string, query?: Record<string, string | undefined>): Promise<T> => {
  const url = new URL(`${baseUrl()}/internal${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const response = await fetchWithTimeout(url, {
    method,
    headers: headers(),
    // Item pages carry mask metadata and can run to megabytes.
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'dataset-service'
  });
  if (response.status === 404) throw new NotFoundError('Dataset not found');
  if (!response.ok) throw new BadGatewayError(`dataset-service ${method} ${path} failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
};

const datasetPath = (id: string): string => `/datasets/${encodeURIComponent(id)}`;

export const getDataset = (id: string): Promise<DatasetSummary> => call('GET', datasetPath(id));

/** Live datasets the user may do at least `min` with: `manage` is what the job wizard offers. */
export const listDatasetsFor = (userId: string, min: Permission = 'manage'): Promise<DatasetSummary[]> =>
  call('GET', '/datasets', { userId, min });

/** Ids only, for job lists: "jobs on datasets where I can …". No user: public datasets. */
export const datasetIdsFor = (userId: string | undefined, min: Permission): Promise<string[]> =>
  call('GET', '/datasets/ids', { userId, min });

/**
 * What one account may do with one dataset, and so with its label jobs. A
 * dataset in the trash or gone reads as `none`: its jobs go with it.
 */
export const getPermission = async (id: string, userId?: string): Promise<Permission> => {
  try {
    return (await call<{ permission: Permission }>('GET', `${datasetPath(id)}/permission`, { userId })).permission;
  } catch (error) {
    if (error instanceof NotFoundError) return 'none';
    throw error;
  }
};

/** Every item matching the filter, in path order, following dataset-service's keyset pages. */
export const listItems = async (
  id: string,
  filter: { group: string; kind: 'image' | 'json'; variant?: string; noVariant?: boolean }
): Promise<DatasetItem[]> => {
  const items: DatasetItem[] = [];
  let after: string | undefined;
  do {
    const page = await call<{ items: DatasetItem[]; next: string | null }>('GET', `${datasetPath(id)}/items`, {
      group: filter.group,
      kind: filter.kind,
      variant: filter.variant,
      noVariant: filter.noVariant ? 'true' : undefined,
      limit: '2000',
      after
    });
    items.push(...page.items);
    after = page.next ?? undefined;
  } while (after);
  return items;
};

export const jsonFields = (id: string, group: string, variant: string): Promise<JsonField[]> =>
  call('GET', `${datasetPath(id)}/json-fields`, { group, variant });

export const getManifest = (id: string): Promise<ManifestRow[]> => call('GET', `${datasetPath(id)}/manifest`);

/** Claim the dataset's files for a job; idempotent. */
export const addHold = (id: string, jobId: string): Promise<void> =>
  call('PUT', `${datasetPath(id)}/holds/${SERVICE}/${encodeURIComponent(jobId)}`);

export const removeHold = (id: string, jobId: string): Promise<void> =>
  call('DELETE', `${datasetPath(id)}/holds/${SERVICE}/${encodeURIComponent(jobId)}`);
