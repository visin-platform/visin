import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';
import { ApiResponse } from '../types';
import { Group, GroupRole } from '../types/group';

/**
 * group-service is a separate origin from auth-service, so it needs its own
 * client. Auth still rides the shared `access_token` cookie that
 * createApiClient sends by default — group-service reads it via backend-core's
 * `authenticateToken`, the same as any other browser-facing service.
 */
const groupApi = createApiClient({
  baseUrl: () => getGlobalConfig().GROUP_SERVICE_URL || ''
});

const unwrap = <T>(response: ApiResponse<T>): T => response.data;

export const groupService = {
  listMine: async (): Promise<Group[]> =>
    unwrap(await groupApi.get<ApiResponse<Group[]>>('/api/groups/mine')),

  listDeleted: async (): Promise<Group[]> =>
    unwrap(await groupApi.get<ApiResponse<Group[]>>('/api/groups/mine/deleted')),

  create: async (name: string): Promise<Group> =>
    unwrap(await groupApi.post<ApiResponse<Group>>('/api/groups', { name })),

  rename: async (groupId: string, name: string): Promise<Group> =>
    unwrap(await groupApi.patch<ApiResponse<Group>>(`/api/groups/${groupId}`, { name })),

  remove: (groupId: string): Promise<void> => groupApi.delete<void>(`/api/groups/${groupId}`),

  restore: async (groupId: string): Promise<Group> =>
    unwrap(await groupApi.post<ApiResponse<Group>>(`/api/groups/${groupId}/restore`)),

  deleteForever: (groupId: string): Promise<void> =>
    groupApi.delete<void>(`/api/groups/${groupId}/permanent`),

  addMember: async (groupId: string, email: string, role: GroupRole): Promise<Group> =>
    unwrap(await groupApi.post<ApiResponse<Group>>(`/api/groups/${groupId}/members`, { email, role })),

  updateMemberRole: async (groupId: string, email: string, role: GroupRole): Promise<Group> =>
    unwrap(
      await groupApi.patch<ApiResponse<Group>>(
        `/api/groups/${groupId}/members/${encodeURIComponent(email)}`,
        { role }
      )
    ),

  removeMember: async (groupId: string, email: string): Promise<Group> =>
    unwrap(
      await groupApi.delete<ApiResponse<Group>>(
        `/api/groups/${groupId}/members/${encodeURIComponent(email)}`
      )
    )
};
