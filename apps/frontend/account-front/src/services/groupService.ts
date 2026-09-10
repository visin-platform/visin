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

  createInvitation: async (groupId: string, role: GroupRole): Promise<{ token: string; expiresAt: string; role: GroupRole }> =>
    unwrap(await groupApi.post(`/api/groups/${groupId}/invitations`, { role })),

  revokeInvitations: (groupId: string): Promise<void> => groupApi.delete(`/api/groups/${groupId}/invitations`),

  previewInvitation: async (token: string): Promise<{ groupId: string; name: string; role: GroupRole; expiresAt: string }> =>
    unwrap(await groupApi.post('/api/groups/invitations/preview', { token })),

  acceptInvitation: async (token: string): Promise<Group> =>
    unwrap(await groupApi.post('/api/groups/invitations/accept', { token })),

  updateMemberRole: async (groupId: string, userId: string, role: GroupRole): Promise<Group> =>
    unwrap(
      await groupApi.patch<ApiResponse<Group>>(
        `/api/groups/${groupId}/members/${encodeURIComponent(userId)}`,
        { role }
      )
    ),

  removeMember: async (groupId: string, userId: string): Promise<Group> =>
    unwrap(
      await groupApi.delete<ApiResponse<Group>>(
        `/api/groups/${groupId}/members/${encodeURIComponent(userId)}`
      )
    )
};
