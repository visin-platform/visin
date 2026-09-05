import { ApiResponse } from '../types';
import { ToolCall, ToolUsageSummary } from '../types/toolUsage';
import { authApiClient } from './authApiClient';

/**
 * The MCP audit trail lives on auth-service, which owns the session every one
 * of these is scoped by.
 */
const unwrap = <T>(response: ApiResponse<T>): T => response.data;

export const toolUsageService = {
  summary: async (days: number): Promise<ToolUsageSummary> =>
    unwrap(await authApiClient.get<ApiResponse<ToolUsageSummary>>(`/auth/tool-usage?days=${days}`)),

  recent: async (limit = 50): Promise<ToolCall[]> =>
    unwrap(await authApiClient.get<ApiResponse<ToolCall[]>>(`/auth/tool-calls?limit=${limit}`))
};
