import { Router } from 'express';
import * as controller from '../controllers/sharedAssistantController';
import type { ChatRateLimits } from './rateLimits';

export function createSharedAssistantRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit } = limits;
  router.get('/conversations/:id/assistants', controller.getSharedAssistants);
  router.post('/conversations/:id/assistants', writeLimit, controller.updateSharedAssistants);
  return router;
}
