import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthCheckResult, AuthService, AuthUser } from './authService';

/**
 * How stale the session check may get before returning to the app re-runs it.
 * Each check renews the session cookie, so an installed app left open for days
 * keeps its session alive instead of only renewing on a full page load.
 */
const AUTH_RECHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Redirects to auth-front's login page, returning to the current page after. */
  login: () => void;
  logout: () => Promise<void>;
  /** Re-runs the session check and updates the shared context state; returns the fresh result. */
  refresh: () => Promise<AuthCheckResult>;
}

/**
 * Builds a Context + `useAuth()` hook backed by a single `authService`
 * instance, so every consumer in the app shares one session check instead
 * of each component independently re-fetching `/auth/verify` on mount.
 */
export function createAuthContext(authService: AuthService) {
  const AuthContext = createContext<AuthContextValue | undefined>(undefined);

  // The last session this context resolved; `undefined` until the first check.
  // shell-front mounts a remote's provider each time the user navigates into
  // that app, so starting from what is already known keeps protected pages from
  // flashing "Checking authentication..." on every visit. The check still runs
  // on each mount and corrects it.
  let lastKnownUser: AuthUser | null | undefined;
  let lastCheckedAt = 0;

  function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(lastKnownUser ?? null);
    const [isLoading, setIsLoading] = useState(lastKnownUser === undefined);

    const refresh = useCallback(async (): Promise<AuthCheckResult> => {
      const result = await authService.checkAuth();
      lastCheckedAt = Date.now();
      lastKnownUser = result.user;
      setUser(result.user);
      return result;
    }, []);

    useEffect(() => {
      let cancelled = false;
      refresh().finally(() => {
        if (!cancelled) setIsLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [refresh]);

    // Returning to the app (a tab brought forward, an installed app resumed)
    // re-checks a stale session. A check that could not reach the server — a
    // phone waking up offline — leaves the session as it was rather than
    // signing the user out; the next return tries again.
    useEffect(() => {
      const onVisibilityChange = () => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastCheckedAt < AUTH_RECHECK_INTERVAL_MS) return;
        lastCheckedAt = Date.now();
        void authService.checkAuth().then((result) => {
          if (result.failed) return;
          lastKnownUser = result.user;
          setUser(result.user);
        });
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    const login = useCallback((): void => {
      authService.redirectToLogin();
    }, []);

    const logout = useCallback(async (): Promise<void> => {
      await authService.logout();
      lastKnownUser = null;
      setUser(null);
      window.location.reload();
    }, []);

    return (
      <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, refresh }}>
        {children}
      </AuthContext.Provider>
    );
  }

  function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (context === undefined) {
      throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
  }

  return { AuthProvider, useAuth };
}
