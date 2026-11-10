import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig, useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';

const adminApi = createApiClient({
  baseUrl: () => `${(getGlobalConfig().ADMIN_SERVICE_URL ?? '').replace(/\/$/, '')}/api/admin`
});

/**
 * Whether to offer Administration in the account menu: admin-service answers `/me` only for a platform administrator
 * (the account's own role, which the session's group roles do not say). Only a hint for the menu, since every Admin
 * call checks the role again. Without Admin configured, or with it down, there is no entry, and the page never waits.
 */
export function useIsPlatformAdmin(): boolean {
  const config = useConfig();
  const { user, isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['admin', 'me', user?.id],
    queryFn: async () => (await adminApi.get<{ data: { role?: string } }>('/me', { skipAuthRedirect: true })).data,
    enabled: Boolean(config.ADMIN_SERVICE_URL && config.ADMIN_FRONT_URL) && isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false
  });
  return data?.role === 'admin';
}
