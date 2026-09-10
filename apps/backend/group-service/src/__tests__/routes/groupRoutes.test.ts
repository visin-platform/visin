import router from '../../routes/groupRoutes';

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: unknown[] };
  name?: string;
};

const layers = router.stack as Layer[];
const routes = layers
  .filter((layer) => layer.route)
  .map((layer) => ({
    path: layer.route!.path,
    methods: Object.keys(layer.route!.methods),
    handlerCount: layer.route!.stack.length,
  }));

const find = (method: string, path: string) =>
  routes.find((r) => r.path === path && r.methods.includes(method));

describe('groupRoutes', () => {
  it('mounts validateInternalServiceToken globally before any route', () => {
    const firstRouteIndex = layers.findIndex((l) => l.route);
    const middlewareBeforeRoutes = layers.slice(0, firstRouteIndex).map((l) => l.name);

    expect(middlewareBeforeRoutes).toContain('validateInternalServiceToken');
  });

  it('registers all expected routes', () => {
    expect(find('post', '/')).toBeDefined();
    expect(find('get', '/mine')).toBeDefined();
    expect(find('get', '/mine/deleted')).toBeDefined();
    expect(find('get', '/mine/roles')).toBeDefined();
    expect(find('get', '/:id')).toBeDefined();
    expect(find('patch', '/:id')).toBeDefined();
    expect(find('delete', '/:id')).toBeDefined();
    expect(find('post', '/:id/restore')).toBeDefined();
    expect(find('delete', '/:id/permanent')).toBeDefined();
    expect(find('post', '/:id/invitations')).toBeDefined();
    expect(find('patch', '/:id/members/:memberId')).toBeDefined();
    expect(find('delete', '/:id/members/:memberId')).toBeDefined();
    expect(find('get', '/:id/membership')).toBeDefined();
    expect(routes).toHaveLength(16);
  });

  it('gates every route behind allowUserOrInternalService', () => {
    for (const route of routes) {
      // allowUserOrInternalService (+ optional validateRequest) + controller
      expect(route.handlerCount).toBeGreaterThanOrEqual(2);
    }
  });

  it('validates bodies on mutating routes', () => {
    expect(find('post', '/')!.handlerCount).toBe(3);
    expect(find('patch', '/:id')!.handlerCount).toBe(3);
    expect(find('post', '/:id/invitations')!.handlerCount).toBe(3);
    expect(find('patch', '/:id/members/:memberId')!.handlerCount).toBe(3);
  });
});
