import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWriteCapabilities } from './useWriteCapabilities';
import { visionApi } from '../config/visionApi';

let auth = { user: { id: 'owner' }, isAuthenticated: true };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../config/visionApi', () => ({ visionApi: { get: vi.fn() } }));
const api = vi.mocked(visionApi);
function setup(ids = ['mine', 'other']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useWriteCapabilities('training', ids), { wrapper }) };
}
beforeEach(() => { vi.resetAllMocks(); auth = { user: { id: 'owner' }, isAuthenticated: true }; });

describe('resource write capabilities', () => {
  it('keeps loading and denied resources read-only, then enables only authorized IDs', async () => {
    let resolve!: (result: { data: unknown }) => void;
    api.get.mockReturnValue(new Promise(done => { resolve = done; }));
    const { result } = setup();
    expect(result.current('mine')).toBe(false);
    await act(async () => resolve({ data: { data: { mine: true, other: false } } }));
    await waitFor(() => expect(result.current('mine')).toBe(true));
    expect(result.current('other')).toBe(false);
    expect(result.current('missing')).toBe(false);
    expect(result.current()).toBe(false);
  });
  it('does not reuse one user’s permissions for another user or an anonymous session', async () => {
    api.get.mockResolvedValue({ data: { data: { mine: true } } });
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current('mine')).toBe(true));
    auth = { user: { id: 'stranger' }, isAuthenticated: true };
    api.get.mockResolvedValue({ data: { data: { mine: false } } });
    rerender();
    expect(result.current('mine')).toBe(false);
    auth = { user: { id: 'owner' }, isAuthenticated: false };
    rerender();
    expect(result.current('mine')).toBe(false);
  });
  it('disables stale write controls when rechecking permissions fails', async () => {
    api.get.mockResolvedValue({ data: { data: { mine: true } } });
    const { result, client } = setup();
    await waitFor(() => expect(result.current('mine')).toBe(true));
    api.get.mockRejectedValue(new Error('offline'));
    await act(async () => { await client.invalidateQueries({ queryKey: ['write-capabilities'] }); });
    await waitFor(() => expect(result.current('mine')).toBe(false));
  });
  it('deduplicates IDs and splits requests into bounded batches', async () => {
    api.get.mockResolvedValue({ data: { data: {} } });
    setup([...Array.from({ length: 101 }, (_, i) => `id-${i}`), '', 'id-1']);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    const batches = api.get.mock.calls.map(call => String(call[1]?.params?.ids).split(','));
    expect(batches.map(batch => batch.length)).toEqual([100, 1]);
    expect(new Set(batches.flat()).size).toBe(101);
  });
});
