import router from '../../routes/jobRoutes';

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
    expect(find('get', '/:id/export')).toBeDefined();
    expect(find('get', '/:id/stats')).toBeDefined();
    expect(find('delete', '/:id')).toBeDefined();
    expect(routes).toHaveLength(12);
  });

  it('validates bodies/queries where schemas exist', () => {
    expect(find('post', '/')!.handlerCount).toBe(2); // validateRequest + controller
    expect(find('get', '/')!.handlerCount).toBe(2);
    expect(find('post', '/:id/materialize')!.handlerCount).toBe(2);
  });
});
