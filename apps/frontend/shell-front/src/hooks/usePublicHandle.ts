import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig, useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';

const authApi = createApiClient({ baseUrl: () => (getGlobalConfig().AUTH_SERVICE_URL ?? '').replace(/\/$/, '') });

/**
 * The address of the viewer's public page (`/u/{handle}`), or undefined when they have not turned one on. The session
 * check does not say, so this asks the profile once and keeps the answer: it only decides whether the account menu
 * offers "Your public page", and a profile that cannot be read just leaves the entry out.
 */
export function usePublicHandle(): string | undefined {
  const config = useConfig();
  const { user, isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['profile', 'public-handle', user?.id],
    queryFn: async () =>
      (await authApi.get<{ user?: { handle?: string; profilePublic?: boolean } }>('/auth/profile', { skipAuthRedirect: true }))
        .user,
    enabled: Boolean(config.AUTH_SERVICE_URL) && isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false
  });
  return data?.profilePublic && data.handle ? data.handle : undefined;
}
