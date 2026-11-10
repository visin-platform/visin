import { createConfigProvider, VisinThemeProvider } from '@visin/frontend-core';
export interface AppConfig {
  ADMIN_SERVICE_URL?: string;
  /** auth-service: the session check, the person's name, and signing out. */
  AUTH_SERVICE_URL?: string;
  AUTH_FRONT_URL?: string;
  /** The Visin app, for "Back to Visin". Unset, the link is left out. */
  SHELL_FRONT_URL?: string;
  GRAFANA_URL?: string;
}
// `npm run dev` starts every app on its fixed port, so Admin needs no .env to find them; a VITE_* variable overrides.
export const { ConfigProvider, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig: () => ({
    ADMIN_SERVICE_URL: import.meta.env.VITE_ADMIN_SERVICE_URL || 'http://localhost:5016',
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:5001',
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL || 'http://localhost:3004',
    SHELL_FRONT_URL: import.meta.env.VITE_SHELL_FRONT_URL || 'http://localhost:3010',
    GRAFANA_URL: import.meta.env.VITE_GRAFANA_URL
  }),
  isDev: import.meta.env.DEV,
  configUrl: new URL(/* @vite-ignore */ '/config.json', import.meta.url).href,
  renderChildren: (children) => <VisinThemeProvider>{children}</VisinThemeProvider>
});
