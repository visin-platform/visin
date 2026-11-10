import { Router } from 'express';
import * as controller from '../controllers/adminControlController';
import { requireAdmin } from '../middleware/requireAdmin';
import { createChatRateLimits } from './rateLimits';

/** Platform-admin controls Admin forwards to: Vivi access policies (global and per account), runs and Vivi's profile. */
export function createAdminControlRoutes() {
  const router = Router();
  const { writeLimit } = createChatRateLimits();
  router.use('/admin', requireAdmin);
  router.get('/admin/policies{/:id}', controller.getPolicy);
  router.put('/admin/policies{/:id}', writeLimit, controller.savePolicy);
  router.get('/admin/runs', controller.listRuns);
  router.post('/admin/runs/:id/cancel', writeLimit, controller.cancelRun);
  // The platform assistant's name and public page (Vivi), whoever created it.
  router.get('/admin/profile', controller.getPlatformProfile);
  router.put('/admin/profile', writeLimit, controller.savePlatformProfile);
  return router;
}
