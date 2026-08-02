// @visin/frontend-core - Shared frontend auth/API-client logic for Visin frontends

export { createApiClient, ApiError } from './apiClient';
export type { ApiClientOptions, ApiRequestOptions, ApiClient } from './apiClient';

export { Loader } from './components/Loader';
export type { LoaderProps } from './components/Loader';
export { ErrorPage } from './components/ErrorPage';
export type { ErrorPageProps } from './components/ErrorPage';
export { AppLayout } from './components/AppLayout';
export type {
  AppLayoutProps,
  AppLayoutNavItem,
  AppLayoutInternalNavItem,
  AppLayoutExternalNavItem,
  AppLayoutFooterLink,
  AppLayoutUser
} from './components/AppLayout';
export { createVisinNavItems } from './navigation';
export type { VisinApp, VisinAppUrls } from './navigation';
export { createProtectedRoute } from './components/ProtectedRoute';
export type { ProtectedRouteProps, ProtectedRouteAuth } from './components/ProtectedRoute';
export { createLoginRedirect } from './components/LoginRedirect';
export type { LoginRedirectAuth, LoginRedirectOptions } from './components/LoginRedirect';

export { createAuthService } from './auth/authService';
export type { AuthService, AuthServiceOptions, AuthUser, AuthCheckResult } from './auth/authService';
export { createAuthContext } from './auth/AuthProvider';
export type { AuthContextValue } from './auth/AuthProvider';

export { createConfigProvider } from './config/createConfigProvider';
export type { CreateConfigProviderOptions } from './config/createConfigProvider';
