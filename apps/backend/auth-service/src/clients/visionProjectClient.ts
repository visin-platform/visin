import { BadGatewayError, fetchWithTimeout, HttpError, requireEnv } from '@visin/backend-core';

/** What vision-service says about a project a key is about to be limited to. */
export interface KeyProject {
  id: string;
  name: string;
  /** whether the key's owner may write there — what a pipeline key is for */
  canWrite: boolean;
}

/**
 * vision-service's address: `VISION_SERVICE_URL`, or the host-side dev port
 * outside production. In production there is no fallback, so a missing setting
 * fails loudly instead of calling whatever answers on this host.
 */
const visionServiceUrl = (): string =>
  (
    process.env.VISION_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('VISION_SERVICE_URL') : 'http://localhost:4010')
  ).replace(/\/$/, '');

/**
 * The project, judged for `userId` as vision-service would judge a request from
 * them (editor groups included), or null when there is no such project. Any
 * other failure is vision-service's: a 502, or the 504 a timeout already is.
 */
export async function getKeyProject(projectId: string, userId: string): Promise<KeyProject | null> {
  // Resolved before the call, so missing configuration says so instead of
  // passing for an unreachable peer.
  const url = `${visionServiceUrl()}/internal/projects/${encodeURIComponent(projectId)}/key-access?userId=${encodeURIComponent(userId)}`;
  const headers = { 'x-internal-token': requireEnv('INTERNAL_SERVICE_TOKEN'), 'x-service-id': 'auth-service' };
  let response: Awaited<ReturnType<typeof fetchWithTimeout>>;
  try {
    response = await fetchWithTimeout(url, { headers, timeoutMs: 5000, serviceName: 'vision-service' });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new BadGatewayError('Could not check the project: vision-service is unreachable');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new BadGatewayError(`Could not check the project: vision-service answered ${response.status}`);
  const body = (await response.json()) as { data?: KeyProject };
  if (!body.data || typeof body.data.name !== 'string' || typeof body.data.canWrite !== 'boolean') {
    throw new BadGatewayError('Could not check the project: vision-service answered with something unexpected');
  }
  return body.data;
}
