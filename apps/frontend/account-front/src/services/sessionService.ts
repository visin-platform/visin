import { ApiResponse } from '../types';
import { Session } from '../types/session';
import { authApiClient } from './authApiClient';

/**
 * Signed-in devices live on auth-service, which issues the sessions. Shares
 * `authApiClient` with the profile and API-key services — same origin, same
 * session cookie.
 */
const unwrap = <T>(response: ApiResponse<T>): T => response.data;

export const sessionService = {
  list: async (): Promise<Session[]> =>
    unwrap(await authApiClient.get<ApiResponse<Session[]>>('/auth/sessions')),

  revoke: async (id: string): Promise<void> => {
    await authApiClient.delete<{ success: boolean; signedOut: boolean }>(`/auth/sessions/${id}`);
  },

  /** Signs out every device but this one; resolves to how many were signed out. */
  revokeOthers: async (): Promise<number> =>
    (await authApiClient.post<{ success: boolean; revoked: number }>('/auth/sessions/revoke-others', {})).revoked
};
