import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig, useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';

const chatApi = createApiClient({
  baseUrl: () => `${(getGlobalConfig().CHAT_SERVICE_URL ?? '').replace(/\/$/, '')}/api/chat`
});

/**
 * Whether to offer "Ask Vivi" to a visitor: chat-service says guest Vivi is switched on and fully set up. Only a visitor
 * is asked (a signed-in person has chat itself), and only once the session check is over, so nobody is offered it for a
 * moment and then not. A chat service that is down, or guest Vivi being off, means no button: never a dead end.
 */
export function useGuestVivi(): boolean {
  const config = useConfig();
  const { isAuthenticated, isLoading } = useAuth();
  const { data } = useQuery({
    queryKey: ['guest-vivi', 'capabilities'],
    queryFn: async () => (await chatApi.get<{ data: { enabled?: boolean } }>('/guest/capabilities')).data,
    enabled: Boolean(config.CHAT_SERVICE_URL && config.CHAT_FRONT_URL) && !isAuthenticated && !isLoading,
    staleTime: 5 * 60_000,
    retry: false
  });
  return !isAuthenticated && !isLoading && data?.enabled === true;
}
