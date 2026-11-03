import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const config = vi.hoisted(() => ({ CHAT_SERVICE_URL: 'https://chat-api.test/' as string | undefined }));
const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, isAuthenticated: true }));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

import { useCanConfigureAnalyst } from './useCanConfigureAnalyst';

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
  auth.user = { id: 'u1' };
  auth.isAuthenticated = true;
});

describe('useCanConfigureAnalyst', () => {
  it('asks chat-service with the session cookie, and says yes only for an administrator', async () => {
    const fetchMock = answer({ success: true, data: { assistant: true, canConfigure: true } });
    const { result } = renderHook(() => useCanConfigureAnalyst(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe('https://chat-api.test/api/chat/capabilities');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('says no for anyone else, and for a chat service that fails', async () => {
    const fetchMock = answer({ success: true, data: { assistant: true, canConfigure: false } });
    const first = renderHook(() => useCanConfigureAnalyst(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(first.result.current).toBe(false);
    first.unmount();

    const failing = answer({ message: 'down' }, 503);
    const second = renderHook(() => useCanConfigureAnalyst(), { wrapper });
    await waitFor(() => expect(failing).toHaveBeenCalled());
    expect(second.result.current).toBe(false);
  });

  it('asks nobody where chat is not set up or nobody is signed in', () => {
    const fetchMock = answer({ success: true, data: { canConfigure: true } });
    config.CHAT_SERVICE_URL = undefined;
    expect(renderHook(() => useCanConfigureAnalyst(), { wrapper }).result.current).toBe(false);
    config.CHAT_SERVICE_URL = 'https://chat-api.test';
    auth.isAuthenticated = false;
    expect(renderHook(() => useCanConfigureAnalyst(), { wrapper }).result.current).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
