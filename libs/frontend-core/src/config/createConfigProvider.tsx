import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Loader } from '../components/Loader';
import { ErrorPage } from '../components/ErrorPage';

export interface CreateConfigProviderOptions<T> {
  /** Builds a config object from build-time env vars. Used in dev, during HMR fallback, and (with onFetchError: 'fallback') if /config.json fails to load in production. */
  createDevConfig: () => T;
  /** Whether the app is running in dev mode (pass `import.meta.env.DEV` from the calling app so Vite can statically replace it). */
  isDev: boolean;
  /** 'error-page' (default) renders ErrorPage if /config.json fails to load. 'fallback' falls back to createDevConfig() so the app can still render with build-time env vars. */
  onFetchError?: 'error-page' | 'fallback';
  /** Wraps the resolved config's children, e.g. with CssBaseline/ThemeProvider. Defaults to rendering children unwrapped. */
  renderChildren?: (children: ReactNode) => ReactNode;
  /** Rendered while config is loading. Defaults to the shared Loader. */
  loadingFallback?: ReactNode;
}

export function createConfigProvider<T>(options: CreateConfigProviderOptions<T>) {
  const {
    createDevConfig,
    isDev,
    onFetchError = 'error-page',
    renderChildren = (children: ReactNode) => children,
    loadingFallback = <Loader />
  } = options;

  let globalConfig: T | null = null;

  const ConfigContext = createContext<T>({} as T);

  function getGlobalConfig(): T {
    if (!globalConfig) {
      if (isDev) {
        // During HMR in development, config might be temporarily unavailable
        const fallbackConfig = createDevConfig();
        console.warn('Using fallback configuration during HMR:', fallbackConfig);
        return fallbackConfig;
      }
      throw new Error('Configuration not initialized. Make sure ConfigProvider is mounted.');
    }
    return globalConfig;
  }

  function useConfig(): T {
    return useContext(ConfigContext);
  }

  function ConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      // In development, use environment variables directly
      if (isDev) {
        const devConfig = createDevConfig();
        console.log('Using development configuration from environment variables:', devConfig);
        setConfig(devConfig);
        globalConfig = devConfig;
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
          globalConfig = loadedConfig;
        })
        .catch((err) => {
          console.error('Configuration load error:', err);
          if (onFetchError === 'fallback') {
            const fallback = createDevConfig();
            setConfig(fallback);
            globalConfig = fallback;
          } else {
            setError(err.message);
          }
        });
    }, []);

    if (error) {
      return <ErrorPage />;
    }

    if (!config) {
      return <>{loadingFallback}</>;
    }

    return (
      <ConfigContext.Provider value={config}>
        {renderChildren(children)}
      </ConfigContext.Provider>
    );
  }

  return { ConfigProvider, ConfigContext, useConfig, getGlobalConfig };
}
