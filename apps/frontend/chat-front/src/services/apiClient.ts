import { ApiError, createApiClient } from '@visin/frontend-core';

import { getGlobalConfig } from '../config/ConfigProvider';

const client = createApiClient({
  baseUrl: () => {
    const base = getGlobalConfig().CHAT_SERVICE_URL;
    if (!base) throw new Error('Chat is not configured for this deployment');
    return `${base.replace(/\/$/, '')}/api/chat`;
  }
});

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  try {
    const result =
      body === undefined
        ? await client.get<{ data: T }>(path, { signal })
        : await client.post<{ data: T }>(path, body, { signal });
    return result.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error('Sign in to use chat', { cause: error });
    throw error;
  }
}
