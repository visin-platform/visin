import { Router } from 'express';
import * as controller from '../controllers/runController';
import type { AssistantRateLimits } from './rateLimits';

export function createRunRoutes(limits: AssistantRateLimits) {
  const router = Router();
  const { writeLimit } = limits;
  router.post('/conversations/:id/cancel', writeLimit, controller.cancelRuns);
  return router;
}
