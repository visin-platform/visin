import { Router } from 'express';
import * as controller from '../controllers/runController';
import type { ChatRateLimits } from './rateLimits';

export function createRunRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit } = limits;
  router.get('/conversations/:id/runs', controller.listRuns);
  router.post('/conversations/:id/cancel', writeLimit, controller.cancelRuns);
  return router;
}
