import type { RequestHandler, Router } from 'express';
import { projectKeyAuth } from '../middleware/projectKeyAuth';
import writeCapabilitiesRoutes from './writeCapabilitiesRoutes';
import trainingRoutes from './trainingRoutes';
import epochRoutes from './epochRoutes';
import configRoutes from './configRoutes';
import visualizationRoutes from './visualizationRoutes';
import benchmarkRoutes from './benchmarkRoutes';
import comparisonRoutes from './comparisonRoutes';
import projectRoutes from './projectRoutes';
import findingRoutes from './findingRoutes';
import modelRoutes from './modelRoutes';
import discoveryRoutes from './discoveryRoutes';
import suiteRoutes from './suiteRoutes';
import evaluationRoutes from './evaluationRoutes';
import paperRoutes from './paperRoutes';
import publicRoutes from './publicRoutes';

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
 * `projectKeyAuth` (backend-core's `apiKeyAuth` plus the project limit a key may
 * carry) runs ahead of each route's own authMiddleware/optionalAuthMiddleware
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
  { path: '/api/.well-known', guards: [projectKeyAuth('vision')], router: discoveryRoutes },
  { path: '/api/trainings', guards: [projectKeyAuth('vision', COMPARE_IS_A_READ)], router: trainingRoutes },
  { path: '/api/epochs', guards: [projectKeyAuth('vision')], router: epochRoutes },
  { path: '/api/configs', guards: [projectKeyAuth('vision')], router: configRoutes },
  { path: '/api/visualizations', guards: [projectKeyAuth('vision')], router: visualizationRoutes },
  { path: '/api/benchmarks', guards: [projectKeyAuth('vision')], router: benchmarkRoutes },
  { path: '/api/comparisons', guards: [projectKeyAuth('vision')], router: comparisonRoutes },
  { path: '/api/models', guards: [projectKeyAuth('vision')], router: modelRoutes },
  { path: '/api/projects', guards: [projectKeyAuth('vision')], router: projectRoutes },
  // Anonymous and the same for everyone: no guard, so a credential in the request is not even read.
  { path: '/api/public', guards: [], router: publicRoutes },
  { path: '/api/evaluations', guards: [projectKeyAuth('vision')], router: evaluationRoutes },
  { path: '/api/suites', guards: [projectKeyAuth('vision')], router: suiteRoutes },
  // Written conclusions. Its own scope domain, so an assistant can be granted
  // "read my experiments and record what you conclude" without also being able to
  // rename projects or retag runs.
  { path: '/api/findings', guards: [projectKeyAuth('analysis')], router: findingRoutes },
  // Papers are people's to curate, so no key reaches them: with no guard, a key simply does not authenticate here.
  { path: '/api/papers', guards: [], router: paperRoutes }
];
