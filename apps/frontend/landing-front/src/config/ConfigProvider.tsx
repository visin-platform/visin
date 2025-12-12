import React, { useEffect, useState, ReactNode, useContext } from 'react';

export interface AppConfig {
  VISION_FRONT_URL?: string;
  VISION_API_URL?: string;
}

// Global configuration holder for non-React services
let globalConfig: AppConfig | null = null;

export const ConfigContext = React.createContext<AppConfig>({});

// Helper function to create config from environment variables
function createDevConfig(): AppConfig {
  return {
    VISION_FRONT_URL: import.meta.env.VITE_VISION_FRONT_URL || 'http://localhost:3012',
    VISION_API_URL: import.meta.env.VITE_VISION_API_URL || 'http://localhost:4010',
  };
}

export function getGlobalConfig(): AppConfig {
  if (!globalConfig) {
    if (import.meta.env.DEV) {
      return createDevConfig();
    }
    throw new Error('Configuration not initialized.');
  }
  return globalConfig;
}

export function useConfig() {
  return useContext(ConfigContext);
}

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    // In development, use environment variables directly
    if (import.meta.env.DEV) {
      const devConfig = createDevConfig();
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
        setConfig(loadedConfig);
        globalConfig = loadedConfig;
      })
      .catch((err) => {
        console.error('Configuration load error:', err);
        // Fallback to defaults if fetch fails
        const fallback: AppConfig = {
          VISION_FRONT_URL: 'https://app.visin.eu',
          VISION_API_URL: 'https://api.visin.eu',
        };
        setConfig(fallback);
        globalConfig = fallback;
      });
  }, []);

  if (!config) {
    return <div>Loading configuration...</div>;
  }

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}
