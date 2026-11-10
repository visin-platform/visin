import { createConfigProvider, VisinThemeProvider } from '@visin/frontend-core';
export interface AppConfig {
  AUTH_SERVICE_URL?: string;
  AUTH_FRONT_URL?: string;
  CHAT_SERVICE_URL?: string;
  /** Where the analyst's settings are, for an administrator's link from a chat page that is not inside the shell. */
  ACCOUNT_FRONT_URL?: string;
  /** Platform administration, where the analyst is set up now. Unset, the link falls back to Account's Analyst section. */
  ADMIN_FRONT_URL?: string;
}
export const { ConfigProvider, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig: () => ({
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:5001',
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL || 'http://localhost:3004',
    CHAT_SERVICE_URL: import.meta.env.VITE_CHAT_SERVICE_URL || 'http://localhost:5012',
    ACCOUNT_FRONT_URL: import.meta.env.VITE_ACCOUNT_FRONT_URL || 'http://localhost:3007',
    ADMIN_FRONT_URL: import.meta.env.VITE_ADMIN_FRONT_URL || 'http://localhost:3016'
  }),
  isDev: import.meta.env.DEV,
  configUrl: new URL(/* @vite-ignore */ '/config.json', import.meta.url).href,
  renderChildren: (children) => <VisinThemeProvider>{children}</VisinThemeProvider>
});
