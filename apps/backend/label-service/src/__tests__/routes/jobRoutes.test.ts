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
    expect(routes).toHaveLength(2);
  });

  it('validates the body on job creation', () => {
    // validateRequest + controller
    expect(find('post', '/')!.handlerCount).toBe(2);
  });
});
