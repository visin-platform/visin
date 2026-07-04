import { createAuthService, createAuthContext } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

const authService = createAuthService({
  authServiceUrl: () => getGlobalConfig().AUTH_SERVICE_URL || '',
  authFrontUrl: () => getGlobalConfig().AUTH_FRONT_URL || ''
});

export const { AuthProvider, useAuth } = createAuthContext(authService);
