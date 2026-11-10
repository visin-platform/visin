import { Router } from 'express';
import * as controller from '../controllers/pushController';
import type { ChatRateLimits } from './rateLimits';

export function createPushRoutes(limits: ChatRateLimits) {
  const router = Router();
  router.get('/push/config', controller.config);
  router.get('/push/unread', controller.unread);
  router.post('/push/subscriptions', limits.writeLimit, controller.subscribe);
  router.delete('/push/subscriptions', limits.writeLimit, controller.unsubscribe);
  return router;
}
