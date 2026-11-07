import { Router } from 'express';
import * as controller from '../controllers/screenController';
import type { ChatRateLimits } from './rateLimits';

export function createScreenRoutes(limits: ChatRateLimits) {
  const router = Router();
  router.get('/conversations/:id/screen-calls', controller.listScreenCalls);
  router.post('/screen-calls/:id/result', limits.writeLimit, controller.answerScreenCall);
  return router;
}
