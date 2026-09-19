import { CssBaseline, ThemeProvider } from '@mui/material';
import { createConfigProvider, createVisinTheme } from '@visin/frontend-core';

export interface AppConfig {
  AUTH_SERVICE_URL?: string;
  AUTH_FRONT_URL?: string;
  VISION_FRONT_URL?: string;
  LABEL_FRONT_URL?: string;
  GROUP_SERVICE_URL?: string;
  /** mcp-service's public address, shown to people connecting an assistant. */
  MCP_PUBLIC_URL?: string;
}

function createDevConfig(): AppConfig {
  return {
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL,
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL,
    VISION_FRONT_URL: import.meta.env.VITE_VISION_FRONT_URL,
    LABEL_FRONT_URL: import.meta.env.VITE_LABEL_FRONT_URL,
    GROUP_SERVICE_URL: import.meta.env.VITE_GROUP_SERVICE_URL,
    MCP_PUBLIC_URL: import.meta.env.VITE_MCP_PUBLIC_URL
  };
}

// The one Visin theme, so crossing apps inside the shell never changes the look.
const theme = createVisinTheme();

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  // This app's own config.json, even when shell-front's page is the one running it.
  configUrl: new URL(/* @vite-ignore */ '/config.json', import.meta.url).href,
  renderChildren: (children) => (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
});
