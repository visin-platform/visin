import { CssBaseline } from '@mui/material';
import { createConfigProvider } from '@visin/frontend-core';

export interface AppConfig {
  VISION_API_URL?: string;
  AUTH_SERVICE_URL?: string;
  AUTH_FRONT_URL?: string;
  ACCOUNT_FRONT_URL?: string;
  GROUP_SERVICE_URL?: string;
  LABEL_FRONT_URL?: string;
}

function createDevConfig(): AppConfig {
  return {
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL,
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL,
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL,
    ACCOUNT_FRONT_URL: import.meta.env.VITE_ACCOUNT_FRONT_URL,
    GROUP_SERVICE_URL: import.meta.env.VITE_GROUP_SERVICE_URL,
    LABEL_FRONT_URL: import.meta.env.VITE_LABEL_FRONT_URL
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
