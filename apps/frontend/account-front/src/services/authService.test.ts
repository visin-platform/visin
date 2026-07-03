import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test', AUTH_FRONT_URL: 'http://auth-front.test' })
}));

import { authService } from './authService';

// Node's own experimental global `localStorage` shadows jsdom's polyfill in
// this test environment (unrelated to app code, which always runs in a real
// browser) — stub it explicitly rather than relying on jsdom to provide it.
function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); }
  };
}

describe('authService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', makeLocalStorageStub());
  });

  describe('checkAuth', () => {
    it('returns authenticated + user and stores a refreshed token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1' }, token: 'new-tok' }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await authService.checkAuth();

      expect(result).toEqual({ authenticated: true, user: { id: 'u1' } });
      expect(localStorage.getItem('authToken')).toBe('new-tok');
      const [, init] = fetchMock.mock.calls[0];
      expect(init.credentials).toBe('include');
    });

    it('clears the token and returns unauthenticated when success is false', async () => {
      localStorage.setItem('authToken', 'stale');
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await authService.checkAuth();

      expect(result).toEqual({ authenticated: false, user: null });
      expect(localStorage.getItem('authToken')).toBeNull();
    });

    it('clears the token and returns unauthenticated on a request failure', async () => {
      localStorage.setItem('authToken', 'stale');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'nope' }), { status: 401 })));

      const result = await authService.checkAuth();

      expect(result).toEqual({ authenticated: false, user: null });
      expect(localStorage.getItem('authToken')).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the token and returns true on success', async () => {
      localStorage.setItem('authToken', 'tok');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })));
      // reload isn't implemented in jsdom's default Location
      Object.defineProperty(window, 'location', { value: { ...window.location, reload: vi.fn() }, writable: true });

      const result = await authService.logout();

      expect(result).toBe(true);
      expect(localStorage.getItem('authToken')).toBeNull();
    });

    it('returns false on a failed request without throwing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const result = await authService.logout();

      expect(result).toBe(false);
    });
  });

  describe('getProfile', () => {
    it('returns the user on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, user: { id: 'u1' } }), { status: 200 })));

      expect(await authService.getProfile()).toEqual({ id: 'u1' });
    });

    it('returns null on failure without throwing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'nope' }), { status: 500 })));

      expect(await authService.getProfile()).toBeNull();
    });
  });
});
