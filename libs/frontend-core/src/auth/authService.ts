import { createApiClient } from '../apiClient';

/**
 * Fields observed across the auth-service endpoints frontends call:
 * `/auth/verify` always returns `groups` (JWT-derived); `/auth/profile`
 * returns `firstName`/`lastName` (DB-derived) but not `groups`. Optional
 * fields reflect which endpoint populated the result, not that the field
 * is unreliable.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  groups?: string[];
}

export interface AuthCheckResult {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface AuthServiceOptions {
  /** Base URL of auth-service, e.g. `() => getGlobalConfig().AUTH_SERVICE_URL`. */
  authServiceUrl: () => string;
  /** Base URL of the auth-front login page, e.g. `() => getGlobalConfig().AUTH_FRONT_URL`. */
  authFrontUrl: () => string;
}

/**
 * Session-management logic shared by every Visin frontend: token storage,
 * `/auth/verify` + `/auth/profile` checks, logout, and the redirect to
 * auth-front's login page. Each app previously hand-rolled this
 * (`account-front/services/authService.ts`, `vision-front/contexts/AuthContext.tsx`)
 * with near-identical but subtly diverging logic; wrap the result in
 * `createAuthContext` for a React Context/hook, or use it directly for a
 * plain-object service.
 */
export function createAuthService({ authServiceUrl, authFrontUrl }: AuthServiceOptions) {
  const client = createApiClient({
    baseUrl: authServiceUrl,
    getToken: () => localStorage.getItem('authToken')
  });

  function getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  async function checkAuth(): Promise<AuthCheckResult> {
    try {
      const data = await client.get<{ success: boolean; authenticated: boolean; user?: AuthUser; token?: string }>(
        '/auth/verify',
        { credentials: 'include', skipAuthRedirect: true }
      );

      if (data.success) {
        if (data.token) {
          localStorage.setItem('authToken', data.token);
        }
        return { authenticated: data.authenticated, user: data.user ?? null };
      }
      localStorage.removeItem('authToken');
      return { authenticated: false, user: null };
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('authToken');
      return { authenticated: false, user: null };
    }
  }

  async function getCurrentUser(): Promise<AuthUser | null> {
    const result = await checkAuth();
    return result.user;
  }

  async function getProfile(): Promise<AuthUser | null> {
    try {
      const data = await client.get<{ success: boolean; user?: AuthUser }>('/auth/profile', { credentials: 'include' });
      return data.success ? (data.user ?? null) : null;
    } catch (error) {
      console.error('Get profile failed:', error);
      return null;
    }
  }

  async function isAuthenticated(): Promise<boolean> {
    const result = await checkAuth();
    return result.authenticated;
  }

  async function logout(): Promise<boolean> {
    try {
      const data = await client.post<{ success: boolean }>('/auth/logout', undefined, { credentials: 'include' });
      if (data.success) {
        localStorage.removeItem('authToken');
      }
      return data.success;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  }

  function redirectToLogin(returnUrl?: string): void {
    const currentUrl = returnUrl || window.location.href;
    window.location.href = `${authFrontUrl()}?redirect_uri=${encodeURIComponent(currentUrl)}`;
  }

  return { getToken, checkAuth, getCurrentUser, getProfile, isAuthenticated, logout, redirectToLogin };
}

export type AuthService = ReturnType<typeof createAuthService>;
