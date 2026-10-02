import { BadGatewayError, BadRequestError, fetchWithTimeout, NotFoundError, requireEnv } from '@visin/backend-core';
import type { ResourceOwner } from '@visin/backend-core';
import type { DatasetReference } from '../models/Training';

/** Explicit Visin references resolve to a readable dataset; legacy labels stay usable as `other`. */
export async function resolveDatasetReference(
  dataset: DatasetReference | undefined, legacy: string | undefined, userId: string, projectOwner?: ResourceOwner
): Promise<DatasetReference | undefined> {
  const ref = dataset ?? (legacy ? (legacy.startsWith('visin:')
    ? { source: 'visin' as const, name: legacy.slice(6) }
    : { source: 'other' as const, name: legacy }) : undefined);
  if (!ref || ref.source !== 'visin') return ref;
  const base = process.env.DATASET_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('DATASET_SERVICE_URL') : 'http://localhost:5010');
  const response = await fetchWithTimeout(`${base}/internal/datasets/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Token': requireEnv('INTERNAL_SERVICE_TOKEN') },
    body: JSON.stringify({ reference: ref.id || ref.name, userId, projectOwner }), serviceName: 'dataset-service'
  });
  if (response.status === 404) throw new NotFoundError('Visin dataset not found or not readable');
  if (response.status === 400) throw new BadRequestError('Dataset name is ambiguous; use its id');
  if (!response.ok) throw new BadGatewayError('Could not resolve the Visin dataset');
  const body = await response.json() as { data: DatasetReference };
  if (body.data?.source !== 'visin' || !body.data.id || !body.data.name) throw new BadGatewayError('Invalid dataset reference');
  return { ...body.data, revision: ref.revision ?? body.data.revision };
}
