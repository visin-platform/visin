import { CssBaseline } from '@mui/material';
import { createConfigProvider } from '@visin/frontend-core';

export interface AppConfig {
  GOOGLE_CLIENT_ID?: string;
  AUTH_SERVICE_URL?: string;
  VISION_API_URL?: string;
}

function createDevConfig(): AppConfig {
  return {
    GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL,
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL
  };
}

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  renderChildren: (children) => (
    <>
      <CssBaseline />
      {children}
    </>
  )
});
