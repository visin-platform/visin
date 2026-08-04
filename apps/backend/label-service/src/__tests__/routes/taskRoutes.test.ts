import router from '../../routes/taskRoutes';

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

describe('taskRoutes', () => {
  it('registers task fetch, answer submit + undo', () => {
    expect(find('get', '/:id')).toBeDefined();
    expect(find('post', '/:id/answer')).toBeDefined();
    expect(find('delete', '/:id/answer')).toBeDefined();
    expect(routes).toHaveLength(3);
  });

  it('validates the answer body', () => {
    expect(find('post', '/:id/answer')!.handlerCount).toBe(2);
  });
});
