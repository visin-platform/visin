import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from '../config/ConfigProvider';
import { AuthProvider } from '../contexts/AuthContext';
import AppRoutes from '../routes';
import { queryClient } from '../queryClient';
import { EmbeddedContext } from './EmbeddedContext';

/**
 * Vision as shell-front renders it: the module this app exposes over module
 * federation. The standalone entry wraps the same routes in its own Router and
 * AppLayout; inside the shell both belong to the shell, which keeps its menu
 * mounted while this is swapped in under it. What stays here is only what
 * Vision's pages need of their own — its config, session and query cache.
 */
export default function RemoteApp() {
  return (
    <ConfigProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <EmbeddedContext.Provider value>
            <AppRoutes />
          </EmbeddedContext.Provider>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
