import { createAuthService } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

export const authService = createAuthService({
  authServiceUrl: () => getGlobalConfig().AUTH_SERVICE_URL || '',
  authFrontUrl: () => getGlobalConfig().AUTH_FRONT_URL || ''
});
