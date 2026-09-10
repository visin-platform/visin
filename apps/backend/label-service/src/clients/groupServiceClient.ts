import { requireEnv, fetchWithTimeout } from '@visin/backend-core';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMembership {
  member: boolean;
  role: GroupRole | null;
}

export interface MyGroup {
  groupId: string;
  name: string;
  role: GroupRole;
}

const baseUrl = (): string => (process.env.GROUP_SERVICE_URL || 'http://localhost:5006').replace(/\/$/, '');

const internalHeaders = (): Record<string, string> => ({
  'x-internal-token': requireEnv('INTERNAL_SERVICE_TOKEN'),
  'x-service-id': 'label-service'
});

/** Membership + role of one user in one group. Returns non-member for a missing group. */
export const checkMembership = async (groupId: string, userId: string): Promise<GroupMembership> => {
  const url = `${baseUrl()}/api/groups/${encodeURIComponent(groupId)}/membership?userId=${encodeURIComponent(userId)}`;
  const response = await fetchWithTimeout(url, { headers: internalHeaders(), serviceName: 'group-service' });

  if (response.status === 404) {
    return { member: false, role: null };
  }
  if (!response.ok) {
    throw new Error(`group-service membership check failed (${response.status})`);
  }
  const body = (await response.json()) as { member: boolean; role: GroupRole | null };
  return { member: body.member, role: body.role };
};

/** All groups the user belongs to, with their role in each. */
export const getMyGroups = async (userId: string): Promise<MyGroup[]> => {
  const url = `${baseUrl()}/api/groups/mine?userId=${encodeURIComponent(userId)}`;
  const response = await fetchWithTimeout(url, { headers: internalHeaders(), serviceName: 'group-service' });

  if (!response.ok) {
    throw new Error(`group-service group listing failed (${response.status})`);
  }
  const body = (await response.json()) as {
    data: { _id: string; name: string; members: { userId: string; role: GroupRole }[] }[];
  };
  return (body.data || []).map((group) => ({
    groupId: String(group._id),
    name: group.name,
    role: group.members.find((m) => m.userId === userId)?.role || 'member'
  }));
};
