import { useEffect, type ReactNode } from 'react';
import { Loader } from '../Loader';
import type { AuthContextValue } from '../../auth/AuthProvider';

/**
 * The slice of `useAuth()` a ProtectedRoute needs. Narrower than
 * `AuthContextValue` so a consumer can pass any compatible hook.
 */
export type ProtectedRouteAuth = Pick<AuthContextValue, 'isAuthenticated' | 'isLoading' | 'login'>;

export interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Builds a route guard that redirects to the login page when the session
 * check comes back unauthenticated, and renders its children otherwise.
 *
 * Takes `useAuth` as an argument rather than importing a context: each front
 * builds its own context via `createAuthContext(authService)`, so a context
 * imported inside this lib would be a different, always-empty one. A factory
 * (rather than a `useAuth` prop) keeps the call sites unchanged —
 * `<ProtectedRoute>...</ProtectedRoute>` — and keeps the hook call
 * unconditional, as the rules of hooks require.
 */
export function createProtectedRoute(useAuth: () => ProtectedRouteAuth) {
  return function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading, login } = useAuth();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        login();
      }
    }, [isLoading, isAuthenticated, login]);

    if (isLoading) {
      return <Loader message="Checking authentication..." />;
    }

    if (!isAuthenticated) {
      // login() above navigates away; this is what shows during that beat.
      return <div>Redirecting to login...</div>;
    }

    return <>{children}</>;
  };
}
