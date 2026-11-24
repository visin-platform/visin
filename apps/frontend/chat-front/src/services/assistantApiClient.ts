import { getGlobalConfig } from '../config/ConfigProvider';
import { createServiceApi } from './apiFactory';

/** The assistants' API (assistant-service): their settings, profiles, allowance, findings, and the guest bot. */
export const {
  api: assistantApi,
  apiDelete: assistantApiDelete,
  apiSend: assistantApiSend,
  apiPut: assistantApiPut
} = createServiceApi(() => {
  const base = getGlobalConfig().ASSISTANT_SERVICE_URL;
  if (!base) throw new Error('The assistants are not configured for this deployment');
  return `${base.replace(/\/$/, '')}/api/assistant`;
});
