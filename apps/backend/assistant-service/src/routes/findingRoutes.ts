import { Router } from 'express';
import * as controller from '../controllers/findingController';
import type { AssistantRateLimits } from './rateLimits';

export function createFindingRoutes(limits: AssistantRateLimits) {
  const router = Router();
  const { writeLimit } = limits;
  router.post('/conversations/:id/findings', writeLimit, controller.saveFinding);
  return router;
}
