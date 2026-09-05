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
    expect(find('post', '/api-keys')).toBeDefined();
    expect(find('get', '/api-keys')).toBeDefined();
    expect(find('post', '/api-keys/:id/reveal')).toBeDefined();
    expect(find('post', '/api-keys/:id/revoke')).toBeDefined();
    expect(find('delete', '/api-keys/:id')).toBeDefined();
    expect(find('get', '/tool-usage')).toBeDefined();
    expect(find('get', '/tool-calls')).toBeDefined();
    expect(routes).toHaveLength(20);
  });

  it('lets nobody reach an API key without a session', () => {
    // Every one of these mints, reveals or destroys a credential; none has a
    // public path. The owner is taken from the session and used to scope the
    // query, so there is no route here that can reach someone else's key.
    expect(find('post', '/api-keys')!.handlerCount).toBe(4); // limiter + auth + validation + controller
    expect(find('get', '/api-keys')!.handlerCount).toBe(2);
    expect(find('post', '/api-keys/:id/reveal')!.handlerCount).toBe(3); // limiter + auth + controller
    expect(find('post', '/api-keys/:id/revoke')!.handlerCount).toBe(2);
    expect(find('delete', '/api-keys/:id')!.handlerCount).toBe(2);
  });

  it('keeps the audit trail behind a session', () => {
    // It names what an assistant did on one account; there is no public read.
    expect(find('get', '/tool-usage')!.handlerCount).toBe(2);
    expect(find('get', '/tool-calls')!.handlerCount).toBe(2);
  });

  it('reveals a key over POST, never GET', () => {
    // It mutates (reveals are counted), and a URL that returns a live
    // credential ends up in browser history, referrer headers and access logs.
    expect(find('get', '/api-keys/:id/reveal')).toBeUndefined();
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
