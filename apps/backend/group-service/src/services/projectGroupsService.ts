import { createHmac, timingSafeEqual } from 'crypto';
import { ForbiddenError, requireEnv } from '@visin/backend-core';
import { Group, type GroupRole } from '../models/Group';
import type { ProjectGroupsAssertion } from '../validation/projectGroupsSchemas';

// Read-only service assertion. Do not reuse this verification on mutation routes.
export async function getProjectGroups({
  userId,
  issuedAt,
  signature
}: ProjectGroupsAssertion): Promise<{ id: string; name: string; role: GroupRole }[]> {
  if (Math.abs(Date.now() - issuedAt) > 30_000) throw new ForbiddenError();
  const payload = JSON.stringify(['vision-project-groups', userId, issuedAt]);
  const expected = createHmac('sha256', requireEnv('JWT_SECRET')).update(payload).digest();
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(expected, provided)) throw new ForbiddenError();

  const groups = await Group.find({ 'members.userId': userId, deletedAt: null }).select('_id name members');
  // The role decides what the user may do with a project the group owns.
  return groups.map((group) => ({
    id: group._id.toString(),
    name: group.name,
    role: group.members.find((member) => member.userId === userId)!.role
  }));
}
