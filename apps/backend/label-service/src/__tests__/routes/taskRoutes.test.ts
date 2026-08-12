import router from '../../routes/taskRoutes';

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

describe('taskRoutes', () => {
  it('registers task fetch, answer submit + undo', () => {
    expect(find('get', '/:id')).toBeDefined();
    expect(find('post', '/:id/answer')).toBeDefined();
    expect(find('delete', '/:id/answer')).toBeDefined();
    expect(routes).toHaveLength(3);
  });

  it('validates the answer body', () => {
    // authenticateToken + validateRequest + controller
    expect(find('post', '/:id/answer')!.handlerCount).toBe(3);
  });

  it('leaves reading a frame public and gates both writes', () => {
    expect(find('get', '/:id')!.requiresAuth).toBe(false);
    expect(find('post', '/:id/answer')!.requiresAuth).toBe(true);
    expect(find('delete', '/:id/answer')!.requiresAuth).toBe(true);
  });
});
