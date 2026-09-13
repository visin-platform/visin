import router from '../../routes/bundleRoutes';

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { name?: string }[] };
};

const routes = (router.stack as Layer[])
  .filter((layer) => layer.route)
  .map((layer) => ({
    path: layer.route!.path,
    methods: Object.keys(layer.route!.methods),
    handlerCount: layer.route!.stack.length,
    // The service mounts `optionalAuth` globally, so a route demands a signed-in
    // caller only by naming `authenticateToken` in its own stack.
    requiresAuth: layer.route!.stack.some((handler) => handler.name === 'authenticateToken'),
  }));

const find = (method: string, path: string) =>
  routes.find((r) => r.path === path && r.methods.includes(method));

describe('bundleRoutes', () => {
  it('registers all expected routes', () => {
    expect(find('post', '/')).toBeDefined();
    expect(find('get', '/')).toBeDefined();
    expect(find('get', '/:id')).toBeDefined();
    expect(find('patch', '/:id')).toBeDefined();
    expect(find('get', '/:id/mask-fields')).toBeDefined();
    expect(find('post', '/:id/upload-url')).toBeDefined();
    expect(find('get', '/:id/uploads')).toBeDefined();
    expect(find('post', '/:id/import')).toBeDefined();
    expect(find('post', '/:id/import/preview')).toBeDefined();
    expect(find('get', '/:id/import/:importId')).toBeDefined();
    expect(find('delete', '/:id/import/:importId')).toBeDefined();
    expect(find('delete', '/:id')).toBeDefined();
    expect(routes).toHaveLength(12);
  });

  it('validates bodies on create and import', () => {
    // authenticateToken + validateRequest + controller
    expect(find('post', '/')!.handlerCount).toBe(3);
    expect(find('post', '/:id/import')!.handlerCount).toBe(3);
    expect(find('post', '/:id/import/preview')!.handlerCount).toBe(3);
    expect(find('patch', '/:id')!.handlerCount).toBe(3);
  });

  it('serves reading bundles anonymously and gates everything else', () => {
    // Visibility is decided in the controller: a publicly shared job's bundle.
    expect(find('get', '/')!.requiresAuth).toBe(false);
    expect(find('get', '/:id')!.requiresAuth).toBe(false);

    const gated: [string, string][] = [
      ['post', '/'],
      ['patch', '/:id'],
      ['get', '/:id/mask-fields'],
      ['post', '/:id/upload-url'],
      ['get', '/:id/uploads'],
      ['post', '/:id/import/preview'],
      ['post', '/:id/import'],
      ['get', '/:id/import/:importId'],
      ['delete', '/:id/import/:importId'],
      ['delete', '/:id'],
    ];
    for (const [method, path] of gated) {
      expect({ method, path, requiresAuth: find(method, path)!.requiresAuth }).toEqual({ method, path, requiresAuth: true });
    }
  });
});
