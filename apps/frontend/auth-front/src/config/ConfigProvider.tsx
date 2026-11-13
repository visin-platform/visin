import { createConfigProvider, VisinThemeProvider } from '@visin/frontend-core';

export interface AppConfig {
  /** Optional self-hosted Faro collector (`/collect/faro`). Empty disables browser telemetry. */
  FARO_COLLECTOR_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  AUTH_SERVICE_URL?: string;
  VISION_API_URL?: string;
}

function createDevConfig(): AppConfig {
  return {
    ...(import.meta.env.VITE_FARO_COLLECTOR_URL ? { FARO_COLLECTOR_URL: import.meta.env.VITE_FARO_COLLECTOR_URL } : {}),
    GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL,
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL
  };
}

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  // The one Visin theme: the sign-in page is the first screen of the app, and
  // should look like it.
  renderChildren: (children) => (
    <VisinThemeProvider>{children}</VisinThemeProvider>
  )
});
