import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../../config/ConfigProvider';

const chatApi = createApiClient({
  baseUrl: () => `${(getGlobalConfig().CHAT_SERVICE_URL ?? '').replace(/\/$/, '')}/api/chat`
});

const KEY = ['chat', 'unread'] as const;

/** Conversations opened or left tell the count to look again: reading one is what lowers it. */
const REFRESH_EVENTS = ['visin:chat-selected', 'visin:chat-detail'] as const;

/**
 * How many conversations have messages the person has not read, for the badge on the Chat tab. Asked of chat-service
 * (the same count the installed app's icon shows), again on leaving chat, when the window comes back, when a
 * conversation is opened or left, and once a minute for what arrives meanwhile. Only where the badge is drawn: the
 * phone's tab bar. A failed or missing answer is no badge: the count is a hint, never an error.
 */
export function useChatUnread(enabled: boolean): number {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await chatApi.get<{ data: { unread?: number } }>('/push/unread')).data.unread ?? 0,
    enabled: enabled && Boolean(getGlobalConfig().CHAT_SERVICE_URL),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false
  });

  // Messages are read in chat, so leaving it is when the count goes down; other page changes leave it as it was.
  const onChat = pathname === '/chat' || pathname.startsWith('/chat/');
  const wasOnChat = useRef(onChat);
  useEffect(() => {
    if (enabled && wasOnChat.current && !onChat) void queryClient.invalidateQueries({ queryKey: KEY });
    wasOnChat.current = onChat;
  }, [enabled, onChat, queryClient]);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
    for (const name of REFRESH_EVENTS) window.addEventListener(name, refresh);
    return () => {
      for (const name of REFRESH_EVENTS) window.removeEventListener(name, refresh);
    };
  }, [enabled, queryClient]);

  return enabled ? (data ?? 0) : 0;
}
