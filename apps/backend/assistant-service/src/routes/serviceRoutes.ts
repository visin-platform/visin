import { authenticateToken } from '@visin/backend-core';
import { Router } from 'express';
import { createAdminControlRoutes } from './adminControlRoutes';
import { createAssistantAdminRoutes } from './assistantAdminRoutes';
import { createAssistantRoutes } from './assistantRoutes';
import { createFindingRoutes } from './findingRoutes';
import { createInternalRoutes } from './internalRoutes';
import { createAssistantRateLimits } from './rateLimits';
import { createRunRoutes } from './runRoutes';
import { createScreenRoutes } from './screenRoutes';
import { createSharedAssistantRoutes } from './sharedAssistantRoutes';

export function createServiceRoutes() {
  const router = Router();
  const limits = createAssistantRateLimits();
  router.use(createInternalRoutes());
  router.use(authenticateToken);
  router.use(createAdminControlRoutes());
  router.use(createAssistantRoutes(limits));
  router.use(createAssistantAdminRoutes(limits));
  router.use(createSharedAssistantRoutes(limits));
  router.use(createRunRoutes(limits));
  router.use(createScreenRoutes(limits));
  router.use(createFindingRoutes(limits));
  return router;
}
