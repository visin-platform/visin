import { ApiResponse } from '../types';
import { ApiKey, CreateApiKeyRequest, CreatedApiKey } from '../types/apiKey';
import { authApiClient } from './authApiClient';

/**
 * API keys live on auth-service, which is the service that already knows who
 * you are. Every other service only ever verifies a presented key.
 *
 * Shares `authApiClient` with profileService — same origin, same shared
 * `access_token` cookie, sent automatically.
 */
const unwrap = <T>(response: ApiResponse<T>): T => response.data;

export const apiKeyService = {
  list: async (): Promise<ApiKey[]> =>
    unwrap(await authApiClient.get<ApiResponse<ApiKey[]>>('/auth/api-keys')),

  create: async (request: CreateApiKeyRequest): Promise<CreatedApiKey> =>
    unwrap(await authApiClient.post<ApiResponse<CreatedApiKey>>('/auth/api-keys', request)),

  /**
   * A POST despite reading, matching the endpoint: the reveal is counted and
   * timestamped, and a URL that returns a live credential would end up in
   * browser history and access logs.
   */
  reveal: async (id: string): Promise<string> =>
    unwrap(await authApiClient.post<ApiResponse<{ token: string }>>(`/auth/api-keys/${id}/reveal`, {}))
      .token,

  revoke: async (id: string): Promise<ApiKey> =>
    unwrap(await authApiClient.post<ApiResponse<ApiKey>>(`/auth/api-keys/${id}/revoke`, {})),

  remove: async (id: string): Promise<void> => {
    await authApiClient.delete<ApiResponse<never>>(`/auth/api-keys/${id}`);
  }
};
