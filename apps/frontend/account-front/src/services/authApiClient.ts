import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * Shared by authService and profileService — both call auth-service, which
 * accepts either the Bearer token or the browser cookie, so requests send
 * both (credentials: 'include' passed per-call) rather than relying on one.
 */
export const authApiClient = createApiClient({
  baseUrl: () => getGlobalConfig().AUTH_SERVICE_URL || '',
  getToken: () => localStorage.getItem('authToken')
});
