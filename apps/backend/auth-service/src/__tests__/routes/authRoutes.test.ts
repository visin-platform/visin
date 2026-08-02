import router from '../../routes/authRoutes';

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: unknown[] };
};

const routes = (router.stack as Layer[])
  .filter((layer) => layer.route)
  .map((layer) => ({
    path: layer.route!.path,
    methods: Object.keys(layer.route!.methods),
    handlerCount: layer.route!.stack.length,
  }));

const find = (method: string, path: string) =>
  routes.find((r) => r.path === path && r.methods.includes(method));

describe('authRoutes', () => {
  it('registers all expected routes', () => {
    expect(find('post', '/validate')).toBeDefined();
    expect(find('get', '/setup-status')).toBeDefined();
    expect(find('post', '/setup')).toBeDefined();
    expect(find('post', '/register')).toBeDefined();
    expect(find('post', '/login')).toBeDefined();
    expect(find('post', '/refresh')).toBeDefined();
    expect(find('post', '/logout')).toBeDefined();
    expect(find('get', '/profile')).toBeDefined();
    expect(find('put', '/profile')).toBeDefined();
    expect(find('post', '/profile/password')).toBeDefined();
    expect(find('get', '/verify')).toBeDefined();
    expect(find('post', '/internal/invalidate-tokens')).toBeDefined();
    expect(find('get', '/admin/users')).toBeDefined();
    expect(routes).toHaveLength(13);
  });

  it('keeps /validate public (validation + controller only, no auth middleware)', () => {
    expect(find('post', '/validate')!.handlerCount).toBe(2);
  });

  it('keeps the password strategy routes public', () => {
    // Nobody can hold a session before signing in, so these cannot require one.
    expect(find('get', '/setup-status')!.handlerCount).toBe(1);
    expect(find('post', '/setup')!.handlerCount).toBe(2);
    expect(find('post', '/register')!.handlerCount).toBe(2);
    expect(find('post', '/login')!.handlerCount).toBe(2);
  });

  it('protects mutating and profile routes with auth middleware', () => {
    // authenticateToken + controller
    expect(find('post', '/refresh')!.handlerCount).toBe(2);
    expect(find('post', '/logout')!.handlerCount).toBe(2);
    expect(find('get', '/profile')!.handlerCount).toBe(2);
    expect(find('get', '/verify')!.handlerCount).toBe(2);
    // + validateRequest
    expect(find('put', '/profile')!.handlerCount).toBe(3);
    expect(find('post', '/profile/password')!.handlerCount).toBe(3);
  });

  it('gates admin routes behind the admin role', () => {
    // authenticateToken + requireRole + controller
    expect(find('get', '/admin/users')!.handlerCount).toBe(3);
  });

  it('gates internal token invalidation behind the internal service token', () => {
    // requireInternalServiceToken + validateRequest + controller
    expect(find('post', '/internal/invalidate-tokens')!.handlerCount).toBe(3);
  });
});
