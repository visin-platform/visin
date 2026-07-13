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
    expect(find('post', '/refresh')).toBeDefined();
    expect(find('post', '/logout')).toBeDefined();
    expect(find('get', '/profile')).toBeDefined();
    expect(find('put', '/profile')).toBeDefined();
    expect(find('get', '/verify')).toBeDefined();
    expect(find('post', '/internal/invalidate-tokens')).toBeDefined();
    expect(find('post', '/admin/approve')).toBeDefined();
    expect(find('get', '/admin/users')).toBeDefined();
    expect(routes).toHaveLength(9);
  });

  it('keeps /validate public (validation + controller only, no auth middleware)', () => {
    expect(find('post', '/validate')!.handlerCount).toBe(2);
  });

  it('protects mutating and profile routes with auth + approval middleware', () => {
    // authenticateToken + requireApproved + controller
    expect(find('post', '/refresh')!.handlerCount).toBe(3);
    expect(find('post', '/logout')!.handlerCount).toBe(3);
    expect(find('get', '/profile')!.handlerCount).toBe(3);
    expect(find('get', '/verify')!.handlerCount).toBe(3);
    // + validateRequest for the PUT
    expect(find('put', '/profile')!.handlerCount).toBe(4);
  });

  it('gates admin routes behind the admin role', () => {
    // authenticateToken + requireApproved + requireRole + validate + controller
    expect(find('post', '/admin/approve')!.handlerCount).toBe(5);
    expect(find('get', '/admin/users')!.handlerCount).toBe(4);
  });

  it('gates internal token invalidation behind the internal service token', () => {
    // requireInternalServiceToken + validateRequest + controller
    expect(find('post', '/internal/invalidate-tokens')!.handlerCount).toBe(3);
  });
});
