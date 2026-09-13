import { QueryClient } from '@tanstack/react-query';

/**
 * One client for the page's lifetime, used by both entries (standalone
 * `main.tsx` and the federated `RemoteApp`). Created at module scope so the
 * cache survives shell-front navigating out of Labeling and back in.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false }
  }
});
