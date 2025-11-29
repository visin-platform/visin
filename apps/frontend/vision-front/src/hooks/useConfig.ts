import { useContext } from 'react';
import { ConfigContext } from '../config/ConfigProvider';

export function useConfig() {
  return useContext(ConfigContext);
}
