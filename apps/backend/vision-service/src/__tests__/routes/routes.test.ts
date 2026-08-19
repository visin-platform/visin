import type { Router } from 'express';
import analysisRoutes from '../../routes/analysisRoutes';
import apiTokenRoutes from '../../routes/apiTokenRoutes';
import benchmarkRoutes from '../../routes/benchmarkRoutes';
import comparisonRoutes from '../../routes/comparisonRoutes';
import configRoutes from '../../routes/configRoutes';
import datasetImageRoutes from '../../routes/datasetImageRoutes';
import datasetRoutes from '../../routes/datasetRoutes';
import epochRoutes from '../../routes/epochRoutes';
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
    ['analysisRoutes', analysisRoutes, 9],
    ['apiTokenRoutes', apiTokenRoutes, 3],
    ['benchmarkRoutes', benchmarkRoutes, 7],
    ['comparisonRoutes', comparisonRoutes, 7],
    ['configRoutes', configRoutes, 5],
    ['datasetImageRoutes', datasetImageRoutes, 8],
    ['datasetRoutes', datasetRoutes, 6],
    ['epochRoutes', epochRoutes, 8],
    ['imageCategoryRoutes', imageCategoryRoutes, 6],
    ['projectRoutes', projectRoutes, 6],
    ['testResultRoutes', testResultRoutes, 10],
    ['trainingRoutes', trainingRoutes, 10],
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
});
