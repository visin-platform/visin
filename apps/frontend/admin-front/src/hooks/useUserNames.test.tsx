import { beforeEach, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUserNames } from './useUserNames';
import { admin } from '../services/admin';

vi.mock('../services/admin', () => ({ admin: vi.fn() }));
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
beforeEach(() => vi.clearAllMocks());

it('shows a name and email, an email alone, and the id itself for anyone nobody answers for', async () => {
  vi.mocked(admin).mockResolvedValue([
    { id: A, email: 'ada@example.test', name: 'Ada Lovelace' },
    { id: B, email: 'no-name@example.test', name: '' }
  ]);
  const unknown = 'c'.repeat(24);
  const { result } = renderHook(() => useUserNames([A, B, unknown]), { wrapper });
  await waitFor(() => expect(result.current(A)).toBe('Ada Lovelace (ada@example.test)'));
  expect(result.current(B)).toBe('no-name@example.test');
  expect(result.current(unknown)).toBe(unknown);
  expect(result.current(undefined)).toBe('');
});

it('asks once for the ids on a page, skipping repeats, guests and anything that is not an account id', async () => {
  vi.mocked(admin).mockResolvedValue([]);
  renderHook(() => useUserNames([A, A, 'guest-session-hash', undefined, B]), { wrapper });
  await waitFor(() => expect(admin).toHaveBeenCalledTimes(1));
  expect(admin).toHaveBeenCalledWith(`/users/lookup?ids=${A},${B}`);
});

it('asks for nobody when no account id is shown, and in batches of fifty for a long report', async () => {
  vi.mocked(admin).mockResolvedValue([]);
  renderHook(() => useUserNames(['guest-1', undefined]), { wrapper });
  expect(admin).not.toHaveBeenCalled();
  const many = Array.from({ length: 120 }, (_, i) => i.toString(16).padStart(24, '0'));
  renderHook(() => useUserNames(many), { wrapper });
  await waitFor(() => expect(admin).toHaveBeenCalledTimes(3));
});
