import { createConfigProvider } from '@visin/frontend-core';

export interface AppConfig {
  /** The "open the app" link: shell-front, the page every app renders into. */
  SHELL_FRONT_URL?: string;
  /** mcp-service's public address; the assistant section shows its endpoint. */
  MCP_PUBLIC_URL?: string;
}

function createDevConfig(): AppConfig {
  return {
    SHELL_FRONT_URL: import.meta.env.VITE_SHELL_FRONT_URL || 'http://localhost:3010',
    MCP_PUBLIC_URL: import.meta.env.VITE_MCP_PUBLIC_URL || 'http://localhost:5009',
  };
}

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  onFetchError: 'fallback',
  loadingFallback: <div>Loading configuration...</div>
});
