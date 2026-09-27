import { BadGatewayError, fetchWithTimeout, HttpError, requireEnv } from '@visin/backend-core';

/** What a group still owns in one service: how many, and the first few names. */
export interface Owned {
  count: number;
  names: string[];
}

/**
 * A peer's address: its env var, or the host-side dev port outside production.
 * In production there is no fallback, so a missing setting fails loudly
 * instead of calling whatever answers on this host.
 */
const serviceUrl = (envVar: string, devPort: number): string =>
  (process.env[envVar] || (process.env.NODE_ENV === 'production' ? requireEnv(envVar) : `http://localhost:${devPort}`)).replace(
    /\/$/,
    ''
  );

const PEERS = {
  projects: { envVar: 'VISION_SERVICE_URL', devPort: 4010, service: 'vision-service' },
  datasets: { envVar: 'DATASET_SERVICE_URL', devPort: 5010, service: 'dataset-service' }
} as const;

/** What `groupId` owns in one service. Any failure is that service's: a 502, or the 504 a timeout already is. */
async function ownedIn(kind: keyof typeof PEERS, groupId: string): Promise<Owned> {
  const { envVar, devPort, service } = PEERS[kind];
  // Resolved before the call, so missing configuration says so instead of
  // passing for an unreachable peer.
  const url = `${serviceUrl(envVar, devPort)}/internal/groups/${encodeURIComponent(groupId)}/owned`;
  const headers = { 'x-internal-token': requireEnv('INTERNAL_SERVICE_TOKEN'), 'x-service-id': 'group-service' };
  let response: Awaited<ReturnType<typeof fetchWithTimeout>>;
  try {
    response = await fetchWithTimeout(url, { headers, timeoutMs: 5000, serviceName: service });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new BadGatewayError(`Could not check what the group owns: ${service} is unreachable`);
  }
  if (!response.ok) throw new BadGatewayError(`Could not check what the group owns: ${service} answered ${response.status}`);
  const body = (await response.json()) as { data?: Owned };
  if (typeof body.data?.count !== 'number' || !Array.isArray(body.data.names)) {
    throw new BadGatewayError(`Could not check what the group owns: ${service} answered with something unexpected`);
  }
  return body.data;
}

/** The projects and datasets a group owns, asked of both services at once. */
export async function ownedByGroup(groupId: string): Promise<{ projects: Owned; datasets: Owned }> {
  const [projects, datasets] = await Promise.all([ownedIn('projects', groupId), ownedIn('datasets', groupId)]);
  return { projects, datasets };
}
