import { BadGatewayError, fetchWithTimeout, ForbiddenError, requireEnv, type ResourceOwner } from '@visin/backend-core';

/** Resolve the live owner and verify the key issuer still contributes to this project. */
export async function projectDatasetOwner(projectId: string, userId: string): Promise<ResourceOwner> {
  const base = process.env.VISION_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('VISION_SERVICE_URL') : 'http://localhost:4010');
  const response = await fetchWithTimeout(
    `${base}/internal/projects/${encodeURIComponent(projectId)}/key-access?userId=${encodeURIComponent(userId)}`,
    { headers: { 'X-Internal-Token': requireEnv('INTERNAL_SERVICE_TOKEN') }, serviceName: 'vision-service' }
  );
  if (response.status === 404) throw new ForbiddenError('The pipeline project is unavailable');
  if (!response.ok) throw new BadGatewayError('Could not verify the pipeline project');
  const body = await response.json() as { data?: { canWrite?: boolean; owner?: ResourceOwner } };
  if (!body.data?.canWrite) throw new ForbiddenError('The pipeline key owner can no longer contribute to this project');
  const owner = body.data.owner;
  if (!owner || !['user', 'group'].includes(owner.kind) || typeof owner.id !== 'string') {
    throw new BadGatewayError('Invalid pipeline project owner');
  }
  return { kind: owner.kind, id: owner.id };
}
