import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';
import { ApiResponse } from '../types';
import {
  AnalystCapabilities,
  AnalystBackfillResult,
  AnalystModels,
  AnalystPriceRefreshResult,
  AnalystPriceTable,
  AnalystProviderId,
  AnalystSettings,
  AnalystSettingsUpdate,
  AnalystUsage
} from '../types/analyst';

/**
 * The analyst's settings live on chat-service, a separate origin from auth-service. The session rides the shared
 * `access_token` cookie, and chat-service checks the administrator role itself on every call: what is hidden
 * from anyone else here is a courtesy, not the protection.
 */
const chatApi = createApiClient({
  baseUrl: () => `${(getGlobalConfig().CHAT_SERVICE_URL || '').replace(/\/$/, '')}/api/chat`
});

const unwrap = <T>(response: ApiResponse<T>): T => response.data;

export const analystService = {
  capabilities: async (): Promise<AnalystCapabilities> =>
    unwrap(await chatApi.get<ApiResponse<AnalystCapabilities>>('/capabilities')),

  settings: async (): Promise<AnalystSettings> =>
    unwrap(await chatApi.get<ApiResponse<AnalystSettings>>('/settings/assistant')),

  models: async (provider: AnalystProviderId): Promise<AnalystModels> =>
    unwrap(await chatApi.get<ApiResponse<AnalystModels>>(`/settings/assistant/models?provider=${provider}`)),

  save: async (update: AnalystSettingsUpdate): Promise<AnalystSettings> =>
    unwrap(await chatApi.put<ApiResponse<AnalystSettings>>('/settings/assistant', update)),

  saveKey: async (provider: AnalystProviderId, key: string): Promise<AnalystSettings> =>
    unwrap(await chatApi.put<ApiResponse<AnalystSettings>>(`/settings/assistant/keys/${provider}`, { key })),

  usage: async (days: number): Promise<AnalystUsage> =>
    unwrap(await chatApi.get<ApiResponse<AnalystUsage>>(`/settings/assistant/usage?days=${days}`)),

  savePrices: async (prices: AnalystPriceTable): Promise<AnalystPriceTable> =>
    unwrap(await chatApi.put<ApiResponse<AnalystPriceTable>>('/settings/assistant/prices', prices)),

  backfillPrices: async (): Promise<AnalystBackfillResult> =>
    unwrap(await chatApi.post<ApiResponse<AnalystBackfillResult>>('/settings/assistant/prices/backfill')),

  refreshPrices: async (): Promise<AnalystPriceRefreshResult> =>
    unwrap(await chatApi.post<ApiResponse<AnalystPriceRefreshResult>>('/settings/assistant/prices/refresh')),

  removeKey: async (provider: AnalystProviderId): Promise<AnalystSettings> =>
    unwrap(await chatApi.delete<ApiResponse<AnalystSettings>>(`/settings/assistant/keys/${provider}`))
};
