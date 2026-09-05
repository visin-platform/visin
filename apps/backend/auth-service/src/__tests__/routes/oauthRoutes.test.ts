import router from '../../routes/oauthRoutes';

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: unknown[] };
};

const routes = (router.stack as Layer[])
  .filter(layer => layer.route)
  .map(layer => ({
    path: layer.route!.path,
    methods: Object.keys(layer.route!.methods),
    handlerCount: layer.route!.stack.length,
  }));

const find = (method: string, path: string) =>
  routes.find(r => r.path === path && r.methods.includes(method));

describe('oauthRoutes', () => {
  it('registers the whole flow and nothing else', () => {
    expect(find('get', '/authorize')).toBeDefined();
    expect(find('post', '/authorize')).toBeDefined();
    expect(find('post', '/register')).toBeDefined();
    expect(find('post', '/token')).toBeDefined();
    expect(find('get', '/connections')).toBeDefined();
    expect(find('delete', '/connections/:clientId')).toBeDefined();
    expect(routes).toHaveLength(6);
  });

  it('leaves /authorize reachable without a session, so login can happen first', () => {
    // An unauthenticated visitor is not an error here — the handler bounces
    // them through the ordinary login and back. optionalAuth + controller.
    expect(find('get', '/authorize')!.handlerCount).toBe(2);
  });

  it('requires a real session to submit a decision', () => {
    // Anyone submitting a decision has already been through login; there is no
    // anonymous path. urlencoded + authenticateToken + controller.
    expect(find('post', '/authorize')!.handlerCount).toBe(3);
  });

  it('leaves registration and the token endpoint unauthenticated by design', () => {
    // Registration grants nothing on its own — a client id only lets you ask a
    // user for consent. The token endpoint authenticates by the code or refresh
    // token it carries, which is the whole point of PKCE.
    expect(find('post', '/register')!.handlerCount).toBe(2); // limiter + controller
    expect(find('post', '/token')!.handlerCount).toBe(2); // urlencoded + controller
  });

  it('keeps connection management session-only', () => {
    // A connected app must not be able to enumerate or cut its siblings.
    expect(find('get', '/connections')!.handlerCount).toBe(2);
    expect(find('delete', '/connections/:clientId')!.handlerCount).toBe(2);
  });
});
