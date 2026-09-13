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
  /**
   * Where the production config lives. Defaults to `/config.json`, which a
   * browser resolves against the *page*. A module-federation remote runs inside
   * shell-front's page, where that is the shell's file, so remotes pass a URL
   * resolved against their own module instead:
   * `new URL('/config.json', import.meta.url).href`.
   */
  configUrl?: string;
}

export function createConfigProvider<T>(options: CreateConfigProviderOptions<T>) {
  const {
    createDevConfig,
    isDev,
    onFetchError = 'error-page',
    renderChildren = (children: ReactNode) => children,
    loadingFallback = <Loader />,
    configUrl = '/config.json'
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
    // Starts from an already-loaded config: shell-front mounts a remote's
    // provider every time the user navigates into that app, and re-fetching
    // (with a loader in between) on each visit is the reload this avoids.
    const [config, setConfig] = useState<T | null>(() => globalConfig);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (globalConfig) {
        return;
      }

      // In development, use environment variables directly
      if (isDev) {
        const devConfig = createDevConfig();
        setConfig(devConfig);
        globalConfig = devConfig;
        return;
      }

      // In production, fetch config.json
      fetch(configUrl)
        .then((res) => {
          if (!res.ok) throw new Error('Config fetch failed');
          return res.json();
        })
        .then((loadedConfig) => {
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
