import { Router } from 'express';
import { authenticateToken, createRateLimiter, NotFoundError, validateRequest } from '@visin/backend-core';
import { getMe, listAudit } from '../controllers/adminController';
import { adminRequestGuard } from '../middleware/adminRequestGuard';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin';
import { auditQuerySchema } from '../validation/adminSchemas';
import groupRoutes from './groupRoutes';
import userRoutes from './userRoutes';
import viviRoutes from './viviRoutes';

/**
 * Everything under `/api/admin`. Only a signed-in platform administrator gets past the guards, and only the
 * operations listed in the area routers are forwarded: anything else is a 404 without reaching an owner.
 */
export function createAdminRoutes(): Router {
  const router = Router();
  // Per address, before the session is checked, so the check itself cannot be hammered. Sized for a person using
  // the pages (the Runs page alone polls every 10 seconds), not the default of a few hundred per quarter hour.
  router.use(
    createRateLimiter({ windowMs: 60_000, max: 600 }),
    authenticateToken,
    requirePlatformAdmin,
    adminRequestGuard
  );

  router.get('/me', getMe);
  router.get('/audit', validateRequest({ query: auditQuerySchema }), listAudit);

  router.use(userRoutes);
  router.use(groupRoutes);
  router.use(viviRoutes);

  router.use((_req, _res, next) => next(new NotFoundError('Unknown administrator operation')));
  return router;
}
