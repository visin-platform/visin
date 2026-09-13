import { QueryClient } from '@tanstack/react-query';

/**
 * One client for the page's lifetime, used by both entries (standalone
 * `main.tsx` and the federated `RemoteApp`). Created at module scope so the
 * cache survives shell-front navigating out of Vision and back in.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
      gcTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});
