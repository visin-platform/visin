import { Router } from 'express';
import * as controller from '../controllers/screenController';
import type { AssistantRateLimits } from './rateLimits';

export function createScreenRoutes(limits: AssistantRateLimits) {
  const router = Router();
  router.get('/conversations/:id/screen-calls', controller.listScreenCalls);
  router.post('/screen-calls/:id/result', limits.writeLimit, controller.answerScreenCall);
  return router;
}
