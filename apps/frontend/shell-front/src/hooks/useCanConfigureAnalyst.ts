import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig, useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';

const assistantApi = createApiClient({
  baseUrl: () => `${(getGlobalConfig().ASSISTANT_SERVICE_URL ?? '').replace(/\/$/, '')}/api/assistant`
});

/**
 * Whether to offer Account's Analyst section: the viewer is a platform administrator, which assistant-service says.
 * Only a hint for the menu, since the service checks the role on every call. An assistant service that is down or not
 * set up means no section, and never holds up the page.
 */
export function useCanConfigureAnalyst(): boolean {
  const config = useConfig();
  const { user, isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['analyst', 'capabilities', user?.id],
    queryFn: async () => (await assistantApi.get<{ data: { canConfigure?: boolean } }>('/capabilities')).data,
    enabled: Boolean(config.ASSISTANT_SERVICE_URL) && isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false
  });
  return data?.canConfigure === true;
}
