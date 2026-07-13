import router from '../../routes/routes';

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

describe('file-service routes', () => {
  it('registers signed-url generation endpoints behind the API key', () => {
    // requireApiKey + express.json + validateRequest + controller
    expect(find('post', '/internal/upload-url')!.handlerCount).toBe(4);
    expect(find('post', '/internal/download-url')!.handlerCount).toBe(4);
  });

  it('registers folder delete before the wildcard file routes', () => {
    const paths = routes.map((r) => r.path);
    expect(paths.indexOf('/internal/files/folder')).toBeLessThan(
      paths.indexOf('/internal/files/*fileId')
    );
    expect(find('put', '/internal/files/folder')).toBeDefined();
    expect(find('delete', '/internal/files/folder')).toBeDefined();
  });

  it('registers internal file CRUD routes behind the API key', () => {
    expect(find('get', '/internal/files')!.handlerCount).toBe(3);
    expect(find('put', '/internal/files/*fileId')!.handlerCount).toBe(2);
    expect(find('get', '/internal/meta/*fileId')!.handlerCount).toBe(2);
    expect(find('head', '/internal/files/*fileId')!.handlerCount).toBe(2);
    expect(find('get', '/internal/files/*fileId')!.handlerCount).toBe(2);
    expect(find('delete', '/internal/files/*fileId')!.handlerCount).toBe(2);
  });

  it('registers public signed upload/download routes', () => {
    // requireSignedToken + controller
    expect(find('put', '/files/upload/*fileId')!.handlerCount).toBe(2);
    expect(find('get', '/files/download/*fileId')!.handlerCount).toBe(2);
  });
});
