import { Router } from 'express';
import * as controller from '../controllers/messageController';
import type { ChatRateLimits } from './rateLimits';

export function createMessageRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit } = limits;
  router.get('/conversations/:id/messages', controller.listMessages);
  router.post('/conversations/:id/messages', writeLimit, controller.sendMessage);
  router.post('/conversations/:id/read', controller.markRead);
  return router;
}
