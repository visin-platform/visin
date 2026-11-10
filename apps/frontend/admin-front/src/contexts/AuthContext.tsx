import { createAuthContext, createAuthService } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

const authService = createAuthService({
  authServiceUrl: () => getGlobalConfig().AUTH_SERVICE_URL || '',
  authFrontUrl: () => getGlobalConfig().AUTH_FRONT_URL || ''
});

/** The shared Visin session: who is signed in (for the menu), signing in and signing out. */
export const { AuthProvider, useAuth } = createAuthContext(authService);
