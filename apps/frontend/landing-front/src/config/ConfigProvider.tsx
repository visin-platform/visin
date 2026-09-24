import { createConfigProvider } from '@visin/frontend-core';

export interface AppConfig {
  /** The "open the app" link: shell-front, the page every app renders into. */
  SHELL_FRONT_URL?: string;
  /** mcp-service's public address; the assistant section shows its endpoint. */
  MCP_PUBLIC_URL?: string;
  /** vision-service's public address; the API reference sends "try it" requests there. */
  VISION_API_URL?: string;
  /** auth-service's public address; the API reference sends its "try it" requests there. */
  AUTH_SERVICE_URL?: string;
}

function createDevConfig(): AppConfig {
  return {
    SHELL_FRONT_URL: import.meta.env.VITE_SHELL_FRONT_URL || 'http://localhost:3010',
    MCP_PUBLIC_URL: import.meta.env.VITE_MCP_PUBLIC_URL || 'http://localhost:5009',
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL || 'http://localhost:4010',
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:5001',
  };
}

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  onFetchError: 'fallback',
  loadingFallback: <div>Loading configuration...</div>
});
