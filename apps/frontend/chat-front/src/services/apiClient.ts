import { getGlobalConfig } from '../config/ConfigProvider';
import { createServiceApi } from './apiFactory';

/** Chat's own API: conversations, messages, calls, push. The assistants' is `assistantApiClient`. */
export const { api, apiDelete, apiSend, apiPut } = createServiceApi(() => {
  const base = getGlobalConfig().CHAT_SERVICE_URL;
  if (!base) throw new Error('Chat is not configured for this deployment');
  return `${base.replace(/\/$/, '')}/api/chat`;
});
