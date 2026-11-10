import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/apiClient';

export interface GuestCapabilities {
  assistant?: { name: string; picture?: string; handle?: string };
  enabled: boolean;
  siteKey: string;
  sessionDailyLimit: number;
}

/** Whether a visitor may ask Vivi, and the limit to tell them. One answer, shared by the page and the chat itself. */
export function useGuestCapabilities() {
  return useQuery({
    queryKey: ['guest-vivi', 'capabilities'],
    queryFn: () => api<GuestCapabilities>('/guest/capabilities'),
    retry: false,
    staleTime: 60_000
  });
}
