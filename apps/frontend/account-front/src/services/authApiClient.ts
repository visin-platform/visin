import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * Shared by authService and profileService — both call auth-service, which
 * authenticates via the shared `access_token` httpOnly cookie (sent
 * automatically by createApiClient's default credentials: 'include').
 */
export const authApiClient = createApiClient({
  baseUrl: () => getGlobalConfig().AUTH_SERVICE_URL || ''
});
