import type { RequestHandler, Router } from 'express';
import { apiKeyAuth } from '@visin/backend-core';
import writeCapabilitiesRoutes from './writeCapabilitiesRoutes';
import trainingRoutes from './trainingRoutes';
import epochRoutes from './epochRoutes';
import configRoutes from './configRoutes';
import testResultRoutes from './testResultRoutes';
import visualizationRoutes from './visualizationRoutes';
import benchmarkRoutes from './benchmarkRoutes';
import comparisonRoutes from './comparisonRoutes';
import projectRoutes from './projectRoutes';
import apiTokenRoutes from './apiTokenRoutes';
import findingRoutes from './findingRoutes';

export interface ApiRouteGroup {
  path: string;
  /** Mounted ahead of the router, e.g. user API key auth. */
  guards: RequestHandler[];
  router: Router;
}

/**
 * User API keys (`vsn_live_…`), for non-browser callers like the MCP server.
 *
 * Mounted per route group rather than once globally, for two reasons. This
 * service answers for three scope domains — `vision` for runs and their
 * results, `dataset` for the data they were trained on, `analysis` for written
 * conclusions — so there is no single domain a global mount could name. And forgetting the guard on a route group added
 * later fails *closed*: keys simply don't authenticate there and the JWT
 * middleware answers 401, rather than the group silently accepting any key.
 *
 * `apiKeyAuth` runs ahead of each route's own authMiddleware/optionalAuthMiddleware
 * and cooperates with them through the `if (req.user) return next()` guard both
 * begin with. Read vs. write is derived from the HTTP method; the `readPaths`
 * entries are the comparison endpoints, which are POSTs that read two runs and
 * write nothing.
 */
const COMPARE_IS_A_READ = { readPaths: [/^\/compare(\/|$)/] };

/**
 * Every route group the service mounts under `/api`. The app mounts from this
 * list and the OpenAPI test reads it, so a group added here is checked against
 * `docs/openapi.yml` without anyone remembering to.
 */
export const API_ROUTE_GROUPS: ApiRouteGroup[] = [
  { path: '/api/write-capabilities', guards: [], router: writeCapabilitiesRoutes },
  { path: '/api/trainings', guards: [apiKeyAuth('vision', COMPARE_IS_A_READ)], router: trainingRoutes },
  { path: '/api/epochs', guards: [apiKeyAuth('vision')], router: epochRoutes },
  { path: '/api/configs', guards: [apiKeyAuth('vision')], router: configRoutes },
  { path: '/api/test-results', guards: [apiKeyAuth('vision', COMPARE_IS_A_READ)], router: testResultRoutes },
  { path: '/api/visualizations', guards: [apiKeyAuth('vision')], router: visualizationRoutes },
  { path: '/api/benchmarks', guards: [apiKeyAuth('vision')], router: benchmarkRoutes },
  { path: '/api/comparisons', guards: [apiKeyAuth('vision')], router: comparisonRoutes },
  { path: '/api/projects', guards: [apiKeyAuth('vision')], router: projectRoutes },
  // Deliberately no apiKeyAuth: this route group mints and revokes the
  // project-scoped tokens the training pipeline authenticates with. Issuing a
  // credential is a thing a person does while signed in, never something one
  // credential should be able to do on behalf of another.
  { path: '/api/api-tokens', guards: [], router: apiTokenRoutes },
  // Written conclusions. Its own scope domain, so an assistant can be granted
  // "read my experiments and record what you conclude" without also being able to
  // rename projects or retag runs.
  { path: '/api/findings', guards: [apiKeyAuth('analysis')], router: findingRoutes }
];
