import { createConfigProvider } from '@visin/frontend-core';

export interface AppConfig {
  VISION_FRONT_URL?: string;
  VISION_API_URL?: string;
}

function createDevConfig(): AppConfig {
  return {
    VISION_FRONT_URL: import.meta.env.VITE_VISION_FRONT_URL || 'http://localhost:3012',
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL || 'http://localhost:4010',
  };
}

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  onFetchError: 'fallback',
  loadingFallback: <div>Loading configuration...</div>
});
