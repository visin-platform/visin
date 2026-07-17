// @visin/frontend-core - Shared frontend auth/API-client logic for Visin frontends

export { createApiClient, ApiError } from './apiClient';
export type { ApiClientOptions, ApiRequestOptions, ApiClient } from './apiClient';

export { Loader } from './components/Loader';
export type { LoaderProps } from './components/Loader';
export { ErrorPage } from './components/ErrorPage';
export type { ErrorPageProps } from './components/ErrorPage';
export { AppLayout } from './components/AppLayout';
export type { AppLayoutProps, AppLayoutNavItem, AppLayoutFooterLink, AppLayoutUser } from './components/AppLayout';

export { createAuthService } from './auth/authService';
export type { AuthService, AuthServiceOptions, AuthUser, AuthCheckResult } from './auth/authService';
export { createAuthContext } from './auth/AuthProvider';
export type { AuthContextValue } from './auth/AuthProvider';

export { createConfigProvider } from './config/createConfigProvider';
export type { CreateConfigProviderOptions } from './config/createConfigProvider';
