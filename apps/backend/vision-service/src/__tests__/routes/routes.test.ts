import type { Router } from 'express';
import analysisRoutes from '../../routes/analysisRoutes';
import apiTokenRoutes from '../../routes/apiTokenRoutes';
import benchmarkRoutes from '../../routes/benchmarkRoutes';
import comparisonRoutes from '../../routes/comparisonRoutes';
import configRoutes from '../../routes/configRoutes';
import datasetImageRoutes from '../../routes/datasetImageRoutes';
import datasetRoutes from '../../routes/datasetRoutes';
import epochRoutes from '../../routes/epochRoutes';
import findingRoutes from '../../routes/findingRoutes';
import imageCategoryRoutes from '../../routes/imageCategoryRoutes';
import projectRoutes from '../../routes/projectRoutes';
import testResultRoutes from '../../routes/testResultRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import visualizationRoutes from '../../routes/visualizationRoutes';

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: unknown[] };
  name?: string;
};

const describeRouter = (router: Router) => {
  const layers = router.stack as unknown as Layer[];
  return {
    routes: layers
      .filter((l) => l.route)
      .map((l) => ({
        path: l.route!.path,
        methods: Object.keys(l.route!.methods),
        handlerCount: l.route!.stack.length,
      })),
    middlewareNames: layers.filter((l) => !l.route).map((l) => l.name),
  };
};

describe('vision-service routers', () => {
  const routers: Array<[string, Router, number]> = [
    ['analysisRoutes', analysisRoutes, 10],
    ['apiTokenRoutes', apiTokenRoutes, 3],
    ['benchmarkRoutes', benchmarkRoutes, 7],
    ['comparisonRoutes', comparisonRoutes, 7],
    ['configRoutes', configRoutes, 5],
    ['datasetImageRoutes', datasetImageRoutes, 8],
    ['datasetRoutes', datasetRoutes, 6],
    ['epochRoutes', epochRoutes, 9],
    ['imageCategoryRoutes', imageCategoryRoutes, 6],
    ['projectRoutes', projectRoutes, 6],
    ['testResultRoutes', testResultRoutes, 10],
    ['trainingRoutes', trainingRoutes, 12],
    ['visualizationRoutes', visualizationRoutes, 8],
  ];

  it.each(routers)('%s registers its routes', (_name, router, expectedRoutes) => {
    const { routes } = describeRouter(router);
    expect(routes.length).toBe(expectedRoutes);
    for (const route of routes) {
      expect(route.methods.length).toBeGreaterThan(0);
      expect(route.handlerCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('apiTokenRoutes mounts JWT auth globally (owner-only surface)', () => {
    const { middlewareNames } = describeRouter(apiTokenRoutes);
    expect(middlewareNames).toContain('authenticateToken');
  });

  it('trainingRoutes protects writes with authMiddleware and reads with optionalAuth', () => {
    const { routes } = describeRouter(trainingRoutes);
    const post = routes.find((r) => r.path === '/' && r.methods.includes('post'))!;
    const del = routes.find((r) => r.path === '/:id' && r.methods.includes('delete'))!;
    const list = routes.find((r) => r.path === '/' && r.methods.includes('get'))!;

    // auth + validate + controller
    expect(post.handlerCount).toBe(3);
    // auth + controller
    expect(del.handlerCount).toBe(2);
    // optionalAuth + validate + controller
    expect(list.handlerCount).toBe(3);
  });

  it('trainingRoutes keeps deleted runs behind auth, ahead of the /:id wildcard', () => {
    const { routes } = describeRouter(trainingRoutes);
    const deleted = routes.find((r) => r.path === '/deleted' && r.methods.includes('get'))!;
    const restore = routes.find((r) => r.path === '/:id/restore' && r.methods.includes('post'))!;
    const gets = routes.filter((r) => r.methods.includes('get')).map((r) => r.path);

    // auth + validate + controller: a recovery list is never public
    expect(deleted.handlerCount).toBe(3);
    // auth + controller
    expect(restore.handlerCount).toBe(2);
    expect(gets.indexOf('/deleted')).toBeLessThan(gets.indexOf('/:id'));
  });

  it('epochRoutes deletes behind auth', () => {
    const { routes } = describeRouter(epochRoutes);
    const del = routes.find((r) => r.path === '/:id' && r.methods.includes('delete'))!;
    expect(del.handlerCount).toBe(2);
  });
});


describe('findingRoutes', () => {
  const { routes } = describeRouter(findingRoutes);
  const find = (method: string, path: string) =>
    routes.find((r) => r.path === path && r.methods.includes(method));

  it('registers the whole surface and nothing else', () => {
    expect(find('get', '/')).toBeDefined();
    expect(find('get', '/:id')).toBeDefined();
    expect(find('get', '/:id/latex')).toBeDefined();
    expect(find('post', '/')).toBeDefined();
    expect(find('delete', '/:id')).toBeDefined();
    expect(routes).toHaveLength(5);
  });

  it('exports through the same optional auth the finding itself follows', () => {
    // The export carries the finding's prose and its cited runs' measurements,
    // so it must be exactly as visible as the finding — no more.
    // optionalAuth + validation + controller.
    expect(find('get', '/:id/latex')!.handlerCount).toBe(3);
  });

  it('lets reads follow the project rather than requiring a session', () => {
    // A finding on a public project is public; one on a private project is
    // invisible. optionalAuth + validation + controller, and + controller.
    expect(find('get', '/')!.handlerCount).toBe(3);
    expect(find('get', '/:id')!.handlerCount).toBe(2);
  });

  it('requires a signed-in caller to write or delete one', () => {
    expect(find('post', '/')!.handlerCount).toBe(3);
    expect(find('delete', '/:id')!.handlerCount).toBe(2);
  });
});
