import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useConfig } from './useConfig';
import { ConfigContext } from '../config/ConfigProvider';

describe('useConfig', () => {
  it('returns the empty default context value when rendered without a provider', () => {
    const { result } = renderHook(() => useConfig());
    expect(result.current).toEqual({});
  });

  it('returns the config value supplied by a ConfigContext.Provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigContext.Provider value={{ VISION_API_URL: 'http://api.test' }}>{children}</ConfigContext.Provider>
    );
    const { result } = renderHook(() => useConfig(), { wrapper });
    expect(result.current.VISION_API_URL).toBe('http://api.test');
  });
});
