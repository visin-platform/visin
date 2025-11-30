import { useContext } from 'react';
import { AppConfig, ConfigContext } from './ConfigProvider';

export function useConfig(): AppConfig {
  const config = useContext(ConfigContext);

  if (!config) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }

  return config;
}
