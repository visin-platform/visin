import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * API keys live on auth-service, not vision-service, so this is the one
 * vision-front service that does not go through `visionApi`. Only the keys a
 * pipeline uses are handled here; Account → API keys manages all of them.
 */
const authApi = createApiClient({ baseUrl: () => getGlobalConfig().AUTH_SERVICE_URL || '' });

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  /** the one project the key is limited to, or null */
  project: { id: string; name: string } | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

/** What a training script needs to send runs and results, and to read them back. */
export const PIPELINE_SCOPES = ['vision:read', 'vision:write'] as const;

export const apiKeyService = {
  /** The caller's own keys limited to this project, newest first. */
  async listForProject(projectId: string): Promise<ApiKey[]> {
    const response = await authApi.get<{ data: ApiKey[] }>('/auth/api-keys');
    return response.data.filter((key) => key.project?.id === projectId);
  },

  /** A key limited to the project, carrying only what a pipeline needs. */
  async createPipelineKey(projectId: string, name: string, expiresInDays?: number): Promise<{ key: ApiKey; token: string }> {
    const response = await authApi.post<{ data: { key: ApiKey; token: string } }>('/auth/api-keys', {
      name,
      scopes: PIPELINE_SCOPES,
      projectId,
      ...(expiresInDays ? { expiresInDays } : {})
    });
    return response.data;
  },

  async revoke(id: string): Promise<void> {
    await authApi.post(`/auth/api-keys/${id}/revoke`, {});
  }
};
