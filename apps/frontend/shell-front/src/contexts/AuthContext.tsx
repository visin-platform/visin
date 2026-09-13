import { createAuthService, createAuthContext } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

const authService = createAuthService({
  authServiceUrl: () => getGlobalConfig().AUTH_SERVICE_URL || '',
  authFrontUrl: () => getGlobalConfig().AUTH_FRONT_URL || ''
});

/**
 * The shell's session, for the menu's user block and Login/Logout. Each remote
 * keeps its own context for its pages; they read the same cookie.
 */
export const { AuthProvider, useAuth } = createAuthContext(authService);
