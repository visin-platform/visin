import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthService } from './authService';

const makeService = () =>
  createAuthService({
    authServiceUrl: () => 'http://auth-api.test',
    authFrontUrl: () => 'http://auth-front.test'
  });

describe('createAuthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAuth', () => {
    it('returns authenticated + user on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1' } }), { status: 200 }))
      );

      const result = await makeService().checkAuth();

      expect(result).toEqual({ authenticated: true, user: { id: 'u1' } });
    });

    it('dedupes concurrent calls into a single request (e.g. React StrictMode double-invoke)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1' } }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);

      const service = makeService();
      const [first, second] = await Promise.all([service.checkAuth(), service.checkAuth()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);
    });

    it('issues a fresh request for a checkAuth call after the previous one has settled', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1' } }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const service = makeService();
      await service.checkAuth();
      await service.checkAuth();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not let one instance\'s in-flight check leak into another instance', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1' } }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await Promise.all([makeService().checkAuth(), makeService().checkAuth()]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('isAuthenticated / getCurrentUser', () => {
    it('both resolve from the same underlying checkAuth call when invoked concurrently', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1' } }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const service = makeService();
      const [isAuth, user] = await Promise.all([service.isAuthenticated(), service.getCurrentUser()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(isAuth).toBe(true);
      expect(user).toEqual({ id: 'u1' });
    });

    it('resolve to unauthenticated/null when the server reports success: false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 })));

      const service = makeService();
      expect(await service.isAuthenticated()).toBe(false);
      expect(await service.getCurrentUser()).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('returns the user on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, user: { id: 'u1' } }), { status: 200 })));

      expect(await makeService().getProfile()).toEqual({ id: 'u1' });
    });

    it('returns null and logs on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await makeService().getProfile()).toBeNull();
      expect(consoleError).toHaveBeenCalledWith('Get profile failed:', expect.anything());
    });
  });

  describe('logout', () => {
    it('returns true on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })));

      expect(await makeService().logout()).toBe(true);
    });

    it('returns false and logs on a failed request', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await makeService().logout()).toBe(false);
      expect(consoleError).toHaveBeenCalledWith('Logout failed:', expect.anything());
    });
  });

  describe('redirectToLogin', () => {
    it('redirects to authFrontUrl with the current URL as redirect_uri by default', () => {
      Object.defineProperty(window, 'location', { value: { ...window.location, href: 'http://app.test/trainings' }, writable: true });

      makeService().redirectToLogin();

      expect(window.location.href).toBe('http://auth-front.test?redirect_uri=http%3A%2F%2Fapp.test%2Ftrainings');
    });

    it('uses an explicit returnUrl when provided', () => {
      makeService().redirectToLogin('http://app.test/datasets');

      expect(window.location.href).toBe('http://auth-front.test?redirect_uri=http%3A%2F%2Fapp.test%2Fdatasets');
    });
  });
});
