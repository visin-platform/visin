import router from '../../routes/bundleRoutes';

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

describe('bundleRoutes', () => {
  it('registers all expected routes', () => {
    expect(find('post', '/')).toBeDefined();
    expect(find('get', '/')).toBeDefined();
    expect(find('get', '/:id')).toBeDefined();
    expect(find('post', '/:id/upload-url')).toBeDefined();
    expect(find('post', '/:id/import')).toBeDefined();
    expect(find('post', '/:id/import/preview')).toBeDefined();
    expect(find('get', '/:id/import/:importId')).toBeDefined();
    expect(find('delete', '/:id/import/:importId')).toBeDefined();
    expect(find('delete', '/:id')).toBeDefined();
    expect(routes).toHaveLength(9);
  });

  it('validates bodies on create and import', () => {
    expect(find('post', '/')!.handlerCount).toBe(2);
    expect(find('post', '/:id/import')!.handlerCount).toBe(2);
    expect(find('post', '/:id/import/preview')!.handlerCount).toBe(2);
  });
});
