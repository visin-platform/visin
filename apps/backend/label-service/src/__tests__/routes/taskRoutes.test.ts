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
  it('registers task fetch and the annotation writes', () => {
    expect(find('get', '/:id')).toBeDefined();
    expect(find('put', '/:id/annotation')).toBeDefined();
    expect(find('put', '/:id/annotation/mask')).toBeDefined();
    expect(find('delete', '/:id/annotation/mask')).toBeDefined();
    expect(find('post', '/:id/annotation/done')).toBeDefined();
    expect(find('post', '/:id/annotation/skip')).toBeDefined();
    expect(routes).toHaveLength(6);
  });

  it('validates the JSON bodies and takes the mask as raw bytes', () => {
    // authenticateToken + validateRequest + controller
    expect(find('put', '/:id/annotation')!.handlerCount).toBe(3);
    expect(find('post', '/:id/annotation/done')!.handlerCount).toBe(3);
    expect(find('post', '/:id/annotation/skip')!.handlerCount).toBe(3);
    // authenticateToken + raw body parser + controller
    expect(find('put', '/:id/annotation/mask')!.handlerCount).toBe(3);
  });

  it('leaves reading a frame public and gates every write', () => {
    expect(find('get', '/:id')!.requiresAuth).toBe(false);
    for (const [method, path] of [
      ['put', '/:id/annotation'],
      ['put', '/:id/annotation/mask'],
      ['delete', '/:id/annotation/mask'],
      ['post', '/:id/annotation/done'],
      ['post', '/:id/annotation/skip'],
    ]) {
      expect(find(method, path)!.requiresAuth).toBe(true);
    }
  });
});
