import { createHmac, timingSafeEqual } from 'crypto';
import { ForbiddenError, requireEnv } from '@visin/backend-core';
import { Group } from '../models/Group';
import type { ProjectGroupsAssertion } from '../validation/projectGroupsSchemas';

// Read-only service assertion. Do not reuse this verification on mutation routes.
export async function getProjectGroups({ userId, email, issuedAt, signature }: ProjectGroupsAssertion): Promise<{ id: string; name: string }[]> {
  if (Math.abs(Date.now() - issuedAt) > 30_000) throw new ForbiddenError();
  const payload = JSON.stringify(['vision-project-groups', userId, email, issuedAt]);
  const expected = createHmac('sha256', requireEnv('JWT_SECRET')).update(payload).digest();
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(expected, provided)) throw new ForbiddenError();

  const groups = await Group.find({ 'members.email': email.toLowerCase(), deletedAt: null }).select('_id name');
  return groups.map(group => ({ id: group._id.toString(), name: group.name }));
}
