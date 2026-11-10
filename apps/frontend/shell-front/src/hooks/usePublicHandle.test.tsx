import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const config = vi.hoisted(() => ({ AUTH_SERVICE_URL: 'https://auth-api.test/' as string | undefined }));
const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, isAuthenticated: true }));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

import { usePublicHandle } from './usePublicHandle';

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
  config.AUTH_SERVICE_URL = 'https://auth-api.test/';
  auth.isAuthenticated = true;
});

describe('usePublicHandle', () => {
  it('gives the handle of a public profile, asking the profile with the session cookie', async () => {
    const fetchMock = answer({ success: true, user: { handle: 'ada', profilePublic: true } });
    const { result } = renderHook(() => usePublicHandle(), { wrapper });
    await waitFor(() => expect(result.current).toBe('ada'));
    expect(fetchMock.mock.calls[0][0]).toBe('https://auth-api.test/auth/profile');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('gives nothing for a profile that is not public, has no handle, or cannot be read', async () => {
    for (const reply of [
      () => answer({ success: true, user: { handle: 'ada', profilePublic: false } }),
      () => answer({ success: true, user: { profilePublic: true } }),
      () => answer({ message: 'down' }, 503)
    ]) {
      const fetchMock = reply();
      const { result, unmount } = renderHook(() => usePublicHandle(), { wrapper });
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(result.current).toBeUndefined();
      unmount();
    }
  });

  it('asks nobody without a session', () => {
    const fetchMock = answer({ success: true, user: { handle: 'ada', profilePublic: true } });
    auth.isAuthenticated = false;
    expect(renderHook(() => usePublicHandle(), { wrapper }).result.current).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
