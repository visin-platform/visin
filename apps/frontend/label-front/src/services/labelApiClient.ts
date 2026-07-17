import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * Every label-service call goes through here — shared auth cookie via
 * createApiClient's default credentials: 'include'. Paths are relative to /api.
 */
export const labelApi = createApiClient({
  baseUrl: () => `${getGlobalConfig().LABEL_SERVICE_URL || ''}/api`
});
