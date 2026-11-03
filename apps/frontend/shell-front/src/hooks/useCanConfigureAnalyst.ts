import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig, useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';

const chatApi = createApiClient({
  baseUrl: () => `${(getGlobalConfig().CHAT_SERVICE_URL ?? '').replace(/\/$/, '')}/api/chat`
});

/**
 * Whether to offer Account's Analyst section: the viewer is a platform administrator, which chat-service says.
 * Only a hint for the menu, since the service checks the role on every call. A chat service that is down or not
 * set up means no section, and never holds up the page.
 */
export function useCanConfigureAnalyst(): boolean {
  const config = useConfig();
  const { user, isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['analyst', 'capabilities', user?.id],
    queryFn: async () => (await chatApi.get<{ data: { canConfigure?: boolean } }>('/capabilities')).data,
    enabled: Boolean(config.CHAT_SERVICE_URL) && isAuthenticated,
    staleTime: 5 * 60_000,
    retry: false
  });
  return data?.canConfigure === true;
}
