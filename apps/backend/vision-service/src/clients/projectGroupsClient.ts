import { createHmac } from 'crypto';
import { BadGatewayError, fetchWithTimeout, HttpError, requireEnv, type GroupRole } from '@visin/backend-core';
import { requestIdentityContext } from '../middleware/requestIdentityContext';

export interface ProjectGroup { id: string; name: string; role: GroupRole }

const ROLES: readonly string[] = ['owner', 'admin', 'member'];

export async function getUserGroups(userId?: string): Promise<ProjectGroup[]> {
  const context = requestIdentityContext.getStore();
  const user = context?.request.user;
  if (!context || !userId || !user || user.id !== userId) return [];
  if (!context.groups) context.groups = fetchGroups(user.id);
  return context.groups;
}

async function fetchGroups(userId: string): Promise<ProjectGroup[]> {
  const issuedAt = Date.now();
  // Purpose-bound assertion uses the existing shared JWT secret, but is not a
  // session token and cannot authenticate to ordinary group-management routes.
  const payload = JSON.stringify(['vision-project-groups', userId, issuedAt]);
  const signature = createHmac('sha256', requireEnv('JWT_SECRET')).update(payload).digest('hex');
  // Container to container where Compose says so. Without this the whole-stack
  // Compose file — which leaves NODE_ENV at development — resolves group-service
  // to vision-service's own container, and every signed-in read fails. Outside
  // production the host-side dev port is the fallback; in production there is
  // none, since the only candidate would be one particular deployment's address.
  const baseUrl =
    process.env.GROUP_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('GROUP_SERVICE_URL') : 'http://localhost:5006');
  // Every failure here is group-service's, not this service's: a 502 (or the
  // 504 a timeout already is), never a 500. A 500 tells API clients the request
  // itself broke something and is not worth retrying; an unreachable peer is.
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/internal/project-groups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, issuedAt, signature }),
      timeoutMs: 3000, serviceName: 'group-service'
    });
    if (!response.ok) throw new BadGatewayError(`Could not verify project group membership: group-service answered ${response.status}`);
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data) ||
        !body.data.every(group => group && typeof group.id === 'string' && /^[0-9a-fA-F]{24}$/.test(group.id) && typeof group.name === 'string' &&
          (group.role === undefined || ROLES.includes(group.role)))) {
      throw new BadGatewayError('Invalid group membership response');
    }
    // A group-service from before roles were sent: the least a member can be.
    return (body.data as ProjectGroup[]).map(group => ({ ...group, role: group.role ?? 'member' }));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // A refused connection or unparseable JSON.
    throw new BadGatewayError('Could not verify project group membership: group-service is unreachable');
  }
}
