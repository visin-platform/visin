import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * Every Admin call goes to admin-service, which checks the platform-admin role and forwards to the owning service.
 * The session rides the shared httpOnly cookie; the shared client turns a non-JSON error page (a proxy's 502) into
 * a readable message instead of a JSON parse error.
 */
const adminApi = createApiClient({
  baseUrl: () => {
    const base = getGlobalConfig().ADMIN_SERVICE_URL;
    if (!base) throw new Error('Admin API is not configured');
    return `${base.replace(/\/$/, '')}/api/admin`;
  }
});

export async function admin<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await adminApi.request<{ data: T }>(path, {
    method,
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) })
  });
  return response.data;
}
