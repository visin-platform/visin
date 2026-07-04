import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test', AUTH_FRONT_URL: 'http://auth-front.test' })
}));

import { authService } from './authService';

describe('authService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAuth', () => {
    it('returns authenticated + user, sending the shared auth cookie', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1' } }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await authService.checkAuth();

      expect(result).toEqual({ authenticated: true, user: { id: 'u1' } });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.credentials).toBe('include');
    });

    it('returns unauthenticated when success is false', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await authService.checkAuth();

      expect(result).toEqual({ authenticated: false, user: null });
    });

    it('returns unauthenticated on a 401 without logging an error (a logged-out visitor is normal, not a bug)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Access token required' }), { status: 401 })));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await authService.checkAuth();

      expect(result).toEqual({ authenticated: false, user: null });
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('logs an error and returns unauthenticated for a non-401 failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'boom' }), { status: 500 })));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await authService.checkAuth();

      expect(result).toEqual({ authenticated: false, user: null });
      expect(consoleError).toHaveBeenCalledWith('Auth check failed:', expect.anything());
    });
  });

  describe('logout', () => {
    it('returns true on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })));
      // reload isn't implemented in jsdom's default Location
      Object.defineProperty(window, 'location', { value: { ...window.location, reload: vi.fn() }, writable: true });

      const result = await authService.logout();

      expect(result).toBe(true);
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
