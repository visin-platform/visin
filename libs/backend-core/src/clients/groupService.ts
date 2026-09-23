import { requireEnv } from '../config/env';
import { BadGatewayError } from '../errors/HttpError';
import { fetchWithTimeout } from '../http/fetchWithTimeout';

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

export interface GroupServiceClient {
  /** Membership + role of one user in one group. Returns non-member for a missing group. */
  checkMembership(groupId: string, userId: string): Promise<GroupMembership>;
  /** All groups the user belongs to, with their role in each. */
  getMyGroups(userId: string): Promise<MyGroup[]>;
}

/**
 * group-service's address: `GROUP_SERVICE_URL`, or the host-side dev port
 * outside production. In production there is no fallback, so a missing setting
 * fails loudly instead of calling whatever answers on this host.
 */
export const groupServiceUrl = (): string =>
  (
    process.env.GROUP_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('GROUP_SERVICE_URL') : 'http://localhost:5006')
  ).replace(/\/$/, '');

/** group-service as another service calls it, identifying itself as `serviceId`. */
export function createGroupServiceClient(serviceId: string): GroupServiceClient {
  const internalHeaders = (): Record<string, string> => ({
    'x-internal-token': requireEnv('INTERNAL_SERVICE_TOKEN'),
    'x-service-id': serviceId
  });

  return {
    async checkMembership(groupId, userId) {
      const url = `${groupServiceUrl()}/api/groups/${encodeURIComponent(groupId)}/membership?userId=${encodeURIComponent(userId)}`;
      const response = await fetchWithTimeout(url, { headers: internalHeaders(), serviceName: 'group-service' });

      if (response.status === 404) {
        return { member: false, role: null };
      }
      if (!response.ok) {
        throw new BadGatewayError(`group-service membership check failed (${response.status})`);
      }
      const body = (await response.json()) as { member: boolean; role: GroupRole | null };
      return { member: body.member, role: body.role };
    },

    async getMyGroups(userId) {
      const url = `${groupServiceUrl()}/api/groups/mine?userId=${encodeURIComponent(userId)}`;
      const response = await fetchWithTimeout(url, { headers: internalHeaders(), serviceName: 'group-service' });

      if (!response.ok) {
        throw new BadGatewayError(`group-service group listing failed (${response.status})`);
      }
      const body = (await response.json()) as {
        data?: { _id: string; name: string; members: { userId: string; role: GroupRole }[] }[];
      };
      return (body.data || []).map((group) => ({
        groupId: String(group._id),
        name: group.name,
        role: group.members.find((m) => m.userId === userId)?.role || 'member'
      }));
    }
  };
}
