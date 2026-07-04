// @visin/frontend-core - Shared frontend auth/API-client logic for Visin frontends

export { createApiClient, ApiError } from './apiClient';
export type { ApiClientOptions, ApiRequestOptions, ApiClient } from './apiClient';

export { Loader } from './components/Loader';
export type { LoaderProps } from './components/Loader';
export { ErrorPage } from './components/ErrorPage';
export type { ErrorPageProps } from './components/ErrorPage';

// Not yet extracted: account-front's `authService.ts`, auth-front's
// `authFlow.ts`, and vision-front's `AuthContext.tsx` implement auth
// (token storage, login/logout, session checks) three different ways
// rather than as copies of one pattern, so unifying them needs its own
// design pass across all three before landing here — see TODO.md.
