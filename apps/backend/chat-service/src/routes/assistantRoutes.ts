import { Router } from 'express';
import * as controller from '../controllers/assistantController';
import type { ChatRateLimits } from './rateLimits';

export function createAssistantRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit } = limits;
  router.get('/assistants/default', controller.getDefaultAssistant);
  router.get('/assistants/catalog', controller.listPublicAssistants);
  router.get('/assistants', controller.listAssistants);
  router.post('/assistants', writeLimit, controller.createAssistant);
  router.get('/assistants/:id/profile', controller.readProfile);
  router.post('/assistants/:id/profile', writeLimit, controller.saveProfile);
  router.post('/assistants/:id', writeLimit, controller.updateAssistant);
  router.post('/assistants/:id/delete', writeLimit, controller.deleteAssistant);
  return router;
}
