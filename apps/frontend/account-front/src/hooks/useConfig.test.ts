import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { useConfig } from './useConfig';
import { ConfigContext, type AppConfig } from '../config/ConfigProvider';

describe('useConfig', () => {
  it('returns the empty default context value outside a ConfigProvider', () => {
    // ConfigContext's default is `{}` (truthy), so the "must be used within
    // a ConfigProvider" guard never actually fires in real app usage.
    const { result } = renderHook(() => useConfig());

    expect(result.current).toEqual({});
  });

  it('throws when the context value is explicitly falsy', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(ConfigContext.Provider, { value: undefined as unknown as AppConfig }, children);

    expect(() => renderHook(() => useConfig(), { wrapper })).toThrow(
      'useConfig must be used within a ConfigProvider'
    );
  });

  it('returns the config value from context', () => {
    const config: AppConfig = { AUTH_SERVICE_URL: 'http://auth.test' };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(ConfigContext.Provider, { value: config }, children);

    const { result } = renderHook(() => useConfig(), { wrapper });

    expect(result.current).toBe(config);
  });
});
