import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const config = vi.hoisted(() => ({
  ADMIN_SERVICE_URL: 'https://admin-api.test/' as string | undefined,
  ADMIN_FRONT_URL: 'https://admin.test' as string | undefined
}));
const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, isAuthenticated: true }));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

import { useIsPlatformAdmin } from './useIsPlatformAdmin';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const answer = (body: unknown, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.restoreAllMocks();
  config.ADMIN_SERVICE_URL = 'https://admin-api.test/';
  config.ADMIN_FRONT_URL = 'https://admin.test';
  auth.user = { id: 'u1' };
  auth.isAuthenticated = true;
});

describe('useIsPlatformAdmin', () => {
  it('asks admin-service with the session cookie, and says yes for a platform administrator', async () => {
    const fetchMock = answer({ success: true, data: { id: 'u1', role: 'admin' } });
    const { result } = renderHook(() => useIsPlatformAdmin(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe('https://admin-api.test/api/admin/me');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('says no when admin-service refuses or is down', async () => {
    const refused = answer({ message: 'Platform administrator access required' }, 403);
    const first = renderHook(() => useIsPlatformAdmin(), { wrapper });
    await waitFor(() => expect(refused).toHaveBeenCalled());
    expect(first.result.current).toBe(false);
    first.unmount();
    const down = answer({ message: 'down' }, 503);
    const second = renderHook(() => useIsPlatformAdmin(), { wrapper });
    await waitFor(() => expect(down).toHaveBeenCalled());
    expect(second.result.current).toBe(false);
  });

  it('asks nobody without Admin configured or a session', () => {
    const fetchMock = answer({ success: true, data: { role: 'admin' } });
    config.ADMIN_FRONT_URL = undefined;
    expect(renderHook(() => useIsPlatformAdmin(), { wrapper }).result.current).toBe(false);
    config.ADMIN_FRONT_URL = 'https://admin.test';
    config.ADMIN_SERVICE_URL = undefined;
    expect(renderHook(() => useIsPlatformAdmin(), { wrapper }).result.current).toBe(false);
    config.ADMIN_SERVICE_URL = 'https://admin-api.test';
    auth.isAuthenticated = false;
    expect(renderHook(() => useIsPlatformAdmin(), { wrapper }).result.current).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
