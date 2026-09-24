import type { Router } from 'express';
import authRoutes from './authRoutes';
import oauthRoutes from './oauthRoutes';
import wellKnownRoutes from './wellKnownRoutes';

export interface ApiRouteGroup {
  path: string;
  router: Router;
}

/**
 * Every route group the service mounts. The app mounts from this list and the
 * OpenAPI test reads it, so a group added here is checked against
 * `docs/openapi.yml` without anyone remembering to.
 */
export const API_ROUTE_GROUPS: ApiRouteGroup[] = [
  { path: '/.well-known', router: wellKnownRoutes },
  { path: '/auth', router: authRoutes },
  { path: '/oauth', router: oauthRoutes }
];
