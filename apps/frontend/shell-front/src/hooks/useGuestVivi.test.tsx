import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const config = vi.hoisted(() => ({
  CHAT_SERVICE_URL: 'https://chat-api.test/' as string | undefined,
  CHAT_FRONT_URL: 'https://chat.test' as string | undefined
}));
const auth = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false }));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

import { useGuestVivi } from './useGuestVivi';

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
  config.CHAT_SERVICE_URL = 'https://chat-api.test/';
  config.CHAT_FRONT_URL = 'https://chat.test';
  auth.isAuthenticated = false;
  auth.isLoading = false;
});

describe('useGuestVivi', () => {
  it('offers Vivi to a visitor when chat-service says guest Vivi is on', async () => {
    const fetchMock = answer({ success: true, data: { enabled: true, siteKey: 'k', sessionDailyLimit: 3 } });
    const { result } = renderHook(() => useGuestVivi(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe('https://chat-api.test/api/chat/guest/capabilities');
  });

  it('offers nothing when it is off, or the chat service fails', async () => {
    const off = answer({ success: true, data: { enabled: false } });
    const first = renderHook(() => useGuestVivi(), { wrapper });
    await waitFor(() => expect(off).toHaveBeenCalled());
    expect(first.result.current).toBe(false);
    first.unmount();
    const down = answer({ message: 'down' }, 503);
    const second = renderHook(() => useGuestVivi(), { wrapper });
    await waitFor(() => expect(down).toHaveBeenCalled());
    expect(second.result.current).toBe(false);
  });

  it('asks nobody who is signed in, still being checked, or where chat is not set up', () => {
    const fetchMock = answer({ success: true, data: { enabled: true } });
    auth.isAuthenticated = true;
    expect(renderHook(() => useGuestVivi(), { wrapper }).result.current).toBe(false);
    auth.isAuthenticated = false;
    auth.isLoading = true;
    expect(renderHook(() => useGuestVivi(), { wrapper }).result.current).toBe(false);
    auth.isLoading = false;
    config.CHAT_FRONT_URL = undefined;
    expect(renderHook(() => useGuestVivi(), { wrapper }).result.current).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
