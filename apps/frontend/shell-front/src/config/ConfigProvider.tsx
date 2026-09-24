import { createConfigProvider, VisinThemeProvider } from '@visin/frontend-core';

export interface AppConfig {
  AUTH_SERVICE_URL?: string;
  AUTH_FRONT_URL?: string;
  /**
   * Base URLs of the remotes, the same addresses their standalone apps run on:
   * each serves `remoteEntry.js` at its root. An app left unset is simply not
   * loadable here, and says so in place of its pages.
   */
  VISION_FRONT_URL?: string;
  LABEL_FRONT_URL?: string;
  ACCOUNT_FRONT_URL?: string;
  /** The services the home page reads. Unset, the parts they feed are left out. */
  VISION_API_URL?: string;
  LABEL_SERVICE_URL?: string;
}

// `npm run dev` starts every app on its fixed port, so the shell needs no .env to
// find them; a VITE_* variable still overrides any of these.
function createDevConfig(): AppConfig {
  return {
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:5001',
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL || 'http://localhost:3004',
    VISION_FRONT_URL: import.meta.env.VITE_VISION_FRONT_URL || 'http://localhost:3012',
    LABEL_FRONT_URL: import.meta.env.VITE_LABEL_FRONT_URL || 'http://localhost:3008',
    ACCOUNT_FRONT_URL: import.meta.env.VITE_ACCOUNT_FRONT_URL || 'http://localhost:3007',
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL || 'http://localhost:4010',
    LABEL_SERVICE_URL: import.meta.env.VITE_LABEL_SERVICE_URL || 'http://localhost:5008'
  };
}

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  // The one Visin theme and light/dark switch, so crossing apps inside the shell never changes the look.
  renderChildren: (children) => (
    <VisinThemeProvider>{children}</VisinThemeProvider>
  )
});
