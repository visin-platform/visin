import { useQuery } from '@tanstack/react-query';
import { chatService } from '../services/chatService';
import type { Allowance } from '../types/chat';

const isAllowance = (value: unknown): value is Allowance => {
  const a = value as Partial<Allowance> | null;
  return (
    typeof a?.remainingShare === 'number' &&
    typeof a.requests?.remaining === 'number' &&
    typeof a.requests.limit === 'number' &&
    typeof a.resetsAt === 'string'
  );
};

/**
 * What is left of today's Vivi allowance, for the person's own chat with an assistant. Quiet: a refused look-up (Vivi
 * off, signed out) is no allowance to show, never an error on the page.
 */
export function useAllowance(enabled: boolean) {
  return useQuery({
    queryKey: ['chat', 'allowance'],
    queryFn: async ({ signal }) => {
      const found: unknown = await chatService.allowance(signal);
      // Anything but what was promised is no allowance to show; it is never worth an error on the page.
      return isAllowance(found) ? found : null;
    },
    select: (found) => found ?? undefined,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    retry: false
  });
}
