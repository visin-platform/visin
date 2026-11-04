import { Router } from 'express';
import * as controller from '../controllers/findingController';
import type { ChatRateLimits } from './rateLimits';

export function createFindingRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit } = limits;
  router.post('/conversations/:id/findings', writeLimit, controller.saveFinding);
  return router;
}
