import { createConfigProvider, VisinThemeProvider } from '@visin/frontend-core';

export interface AppConfig {
  VISION_API_URL?: string;
  DATASET_API_URL?: string;
  AUTH_SERVICE_URL?: string;
  AUTH_FRONT_URL?: string;
  ACCOUNT_FRONT_URL?: string;
  LABEL_FRONT_URL?: string;
  /** Where shell-front, which owns people's public pages (`/u/:handle`), is served; no such links when empty. */
  SHELL_FRONT_URL?: string;
  /** Where this deployment's docs site lives (the landing site), for links to a guide; no such links when empty. */
  LANDING_FRONT_URL?: string;
  /** The Hugging Face Hub that links point at; the public Hub when empty. */
  HF_ENDPOINT?: string;
}

function createDevConfig(): AppConfig {
  return {
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL,
    DATASET_API_URL: import.meta.env.VITE_DATASET_API_URL,
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL,
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL,
    ACCOUNT_FRONT_URL: import.meta.env.VITE_ACCOUNT_FRONT_URL,
    LABEL_FRONT_URL: import.meta.env.VITE_LABEL_FRONT_URL,
    SHELL_FRONT_URL: import.meta.env.VITE_SHELL_FRONT_URL,
    LANDING_FRONT_URL: import.meta.env.VITE_LANDING_FRONT_URL,
    HF_ENDPOINT: import.meta.env.VITE_HF_ENDPOINT
  };
}

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  // This app's own config.json, even when shell-front's page is the one running it.
  configUrl: new URL(/* @vite-ignore */ '/config.json', import.meta.url).href,
  // The one Visin theme and light/dark switch, so crossing apps inside the shell never changes the look.
  renderChildren: (children) => (
    <VisinThemeProvider>{children}</VisinThemeProvider>
  )
});
