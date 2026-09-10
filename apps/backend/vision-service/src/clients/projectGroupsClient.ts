import { createHmac } from 'crypto';
import { fetchWithTimeout, requireEnv } from '@visin/backend-core';
import { requestIdentityContext } from '../middleware/requestIdentityContext';

export interface ProjectGroup { id: string; name: string }

export async function getUserGroups(userId?: string): Promise<ProjectGroup[]> {
  const context = requestIdentityContext.getStore();
  const user = context?.request.user;
  if (!context || !userId || !user?.email || user.id !== userId) return [];
  if (!context.groups) context.groups = fetchGroups(user.id, user.email);
  return context.groups;
}

async function fetchGroups(userId: string, email: string): Promise<ProjectGroup[]> {
  const issuedAt = Date.now();
  // Purpose-bound assertion uses the existing shared JWT secret, but is not a
  // session token and cannot authenticate to ordinary group-management routes.
  const payload = JSON.stringify(['vision-project-groups', userId, email, issuedAt]);
  const signature = createHmac('sha256', requireEnv('JWT_SECRET')).update(payload).digest('hex');
  const baseUrl = process.env.NODE_ENV === 'production' ? 'https://group-api.visin.eu' : 'http://localhost:5006';
  const response = await fetchWithTimeout(`${baseUrl}/api/internal/project-groups`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, email, issuedAt, signature }),
    timeoutMs: 3000, serviceName: 'group-service'
  });
  if (!response.ok) throw new Error('Could not verify project group membership');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data) ||
      !body.data.every(group => group && typeof group.id === 'string' && /^[0-9a-fA-F]{24}$/.test(group.id) && typeof group.name === 'string')) {
    throw new Error('Invalid group membership response');
  }
  return body.data as ProjectGroup[];
}
