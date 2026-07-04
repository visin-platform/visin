import { useEffect, useState, ReactNode } from 'react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { authService } from '../services/authService';
import React from 'react';
import { ErrorPage, Loader } from '@visin/frontend-core';

export interface AppConfig {
  AUTH_SERVICE_URL?: string;
  AUTH_FRONT_URL?: string;
  VISION_FRONT_URL?: string;
}

// Global configuration holder for non-React services
let globalConfig: AppConfig | null = null;

export const ConfigContext = React.createContext<AppConfig>({});

// Helper function to create config from environment variables
function createDevConfig(): AppConfig {
  return {
    AUTH_SERVICE_URL: import.meta.env.VITE_AUTH_SERVICE_URL,
    AUTH_FRONT_URL: import.meta.env.VITE_AUTH_FRONT_URL,
    VISION_FRONT_URL: import.meta.env.VITE_VISION_FRONT_URL
  };
}

export function getGlobalConfig(): AppConfig {
  if (!globalConfig) {
    // During HMR in development, config might be temporarily unavailable
    if (import.meta && import.meta.env && import.meta.env.DEV) {
      // Return a safe fallback config during HMR using environment variables
      const fallbackConfig = createDevConfig();
      console.warn('Using fallback configuration during HMR:', fallbackConfig);
      return fallbackConfig;
    }
    throw new Error('Configuration not initialized. Make sure ConfigProvider is mounted.');
  }
  return globalConfig;
}

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In development, use environment variables directly
    if (import.meta && import.meta.env && import.meta.env.DEV) {
      const devConfig = createDevConfig();
      console.log('Using development configuration from environment variables:', devConfig);
      setConfig(devConfig);
      globalConfig = devConfig;
      authService.init();
      return;
    }

    // In production, fetch config.json
    fetch('/config.json')
      .then((res) => {
        if (!res.ok) throw new Error('Config fetch failed');
        return res.json();
      })
      .then((loadedConfig) => {
        console.log('Using production configuration from config.json:', loadedConfig);
        setConfig(loadedConfig);
        // Set global config for non-React services
        globalConfig = loadedConfig;
        // Initialize auth service
        authService.init();
      })
      .catch((err) => {
        console.error('Configuration load error:', err);
        setError(err.message);
      });
  }, []);

  if (error) {
    return <ErrorPage />;
  }

  if (!config) {
    return <Loader />;
  }

  return (
    <ConfigContext.Provider value={config}>
      <ThemeProvider theme={createTheme({
        palette: {
          primary: {
            main: '#2563eb', // Modern blue
            light: '#60a5fa',
            dark: '#1d4ed8',
          },
          secondary: {
            main: '#64748b', // Slate
          },
          background: {
            default: '#f8fafc', // Very light slate
            paper: '#ffffff',
          },
          text: {
            primary: '#0f172a',
            secondary: '#475569',
          },
          divider: '#e2e8f0',
        },
        typography: {
          fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
          h1: { fontWeight: 700 },
          h2: { fontWeight: 700 },
          h3: { fontWeight: 700 },
          h4: { fontWeight: 600 },
          h5: { fontWeight: 600 },
          h6: { fontWeight: 600 },
          button: { textTransform: 'none', fontWeight: 500 },
        },
        shape: {
          borderRadius: 12,
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: 'none',
                },
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
              },
            },
          },
        },
      })}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ConfigContext.Provider>
  );
}
