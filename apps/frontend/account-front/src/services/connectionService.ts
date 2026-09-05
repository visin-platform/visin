import { ApiResponse } from '../types';
import { Connection } from '../types/connection';
import { authApiClient } from './authApiClient';

/**
 * Connected assistants live on auth-service, which is the OAuth authorization
 * server. Shares `authApiClient` with the profile and API-key services — same
 * origin, same session cookie.
 */
const unwrap = <T>(response: ApiResponse<T>): T => response.data;

export const connectionService = {
  list: async (): Promise<Connection[]> =>
    unwrap(await authApiClient.get<ApiResponse<Connection[]>>('/oauth/connections')),

  revoke: async (clientId: string): Promise<void> => {
    await authApiClient.delete<ApiResponse<never>>(`/oauth/connections/${clientId}`);
  }
};
