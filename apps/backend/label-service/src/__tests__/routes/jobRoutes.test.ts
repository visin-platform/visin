import router from '../../routes/jobRoutes';

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { name?: string }[] };
  name?: string;
};

const layers = router.stack as Layer[];
const routes = layers
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

describe('jobRoutes', () => {
  it('registers all expected routes', () => {
    expect(find('post', '/')).toBeDefined();
    expect(find('get', '/')).toBeDefined();
    expect(find('get', '/:id')).toBeDefined();
    expect(find('post', '/:id/materialize')).toBeDefined();
    expect(find('post', '/:id/activate')).toBeDefined();
    expect(find('post', '/:id/pause')).toBeDefined();
    expect(find('post', '/:id/resume')).toBeDefined();
    expect(find('post', '/:id/archive')).toBeDefined();
    expect(find('post', '/:id/next')).toBeDefined();
    expect(find('get', '/:id/tasks/at/:index')).toBeDefined();
    expect(find('get', '/:id/export')).toBeDefined();
    expect(find('get', '/:id/stats')).toBeDefined();
    expect(find('delete', '/:id')).toBeDefined();
    expect(routes).toHaveLength(13);
  });

  it('validates bodies/queries where schemas exist', () => {
    // authenticateToken + validateRequest + controller
    expect(find('post', '/')!.handlerCount).toBe(3);
    expect(find('post', '/:id/materialize')!.handlerCount).toBe(3);
    // Public, so validateRequest + controller only.
    expect(find('get', '/')!.handlerCount).toBe(2);
    expect(find('get', '/:id/tasks/at/:index')!.handlerCount).toBe(2);
  });

  it('serves reading a job anonymously and gates everything else', () => {
    // A shared link has to resolve without an account.
    expect(find('get', '/')!.requiresAuth).toBe(false);
    expect(find('get', '/:id')!.requiresAuth).toBe(false);
    expect(find('get', '/:id/stats')!.requiresAuth).toBe(false);
    expect(find('get', '/:id/tasks/at/:index')!.requiresAuth).toBe(false);

    // `next` takes a lease, and export emits the collected labels themselves —
    // neither is progress anyone can be shown.
    expect(find('post', '/:id/next')!.requiresAuth).toBe(true);
    expect(find('get', '/:id/export')!.requiresAuth).toBe(true);
    for (const path of ['/', '/:id/materialize', '/:id/activate', '/:id/pause', '/:id/resume', '/:id/archive']) {
      expect(find('post', path)!.requiresAuth).toBe(true);
    }
    expect(find('delete', '/:id')!.requiresAuth).toBe(true);
  });
});
