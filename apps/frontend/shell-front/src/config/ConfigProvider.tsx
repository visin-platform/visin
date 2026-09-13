import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { createConfigProvider } from '@visin/frontend-core';

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
}

// `npm run dev` starts every app on its fixed port, so the shell needs no .env to
// find them; a VITE_* variable still overrides any of these.
function createDevConfig(): AppConfig {
  return {
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:5001',
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL || 'http://localhost:3004',
    VISION_FRONT_URL: import.meta.env.VITE_VISION_FRONT_URL || 'http://localhost:3012',
    LABEL_FRONT_URL: import.meta.env.VITE_LABEL_FRONT_URL || 'http://localhost:3008',
    ACCOUNT_FRONT_URL: import.meta.env.VITE_ACCOUNT_FRONT_URL || 'http://localhost:3007'
  };
}

// The menu's theme — the same one label-front and account-front use. Each
// remote still wraps its own pages in its own theme.
const theme = createTheme({
  palette: {
    primary: {
      main: '#2563eb',
      light: '#60a5fa',
      dark: '#1d4ed8'
    },
    secondary: {
      main: '#64748b'
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff'
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569'
    },
    divider: '#e2e8f0'
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 500 }
  },
  shape: {
    borderRadius: 12
  }
});

export const { ConfigProvider, ConfigContext, useConfig, getGlobalConfig } = createConfigProvider<AppConfig>({
  createDevConfig,
  isDev: import.meta.env.DEV,
  renderChildren: (children) => (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
});
