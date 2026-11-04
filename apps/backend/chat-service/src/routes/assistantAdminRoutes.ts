import { Router } from 'express';
import * as controller from '../controllers/assistantAdminController';
import { requireAdmin } from '../middleware/requireAdmin';
import type { ChatRateLimits } from './rateLimits';

export function createAssistantAdminRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit, inviteLimit } = limits;
  router.get('/settings/assistant', requireAdmin, controller.getSettings);
  router.get('/settings/assistant/models', requireAdmin, controller.listModels);
  router.put('/settings/assistant', writeLimit, requireAdmin, controller.updateSettings);
  router.get('/settings/assistant/usage', requireAdmin, controller.getUsage);
  router.put('/settings/assistant/prices', writeLimit, requireAdmin, controller.updatePrices);
  router.post('/settings/assistant/prices/backfill', inviteLimit, requireAdmin, controller.backfillQuestionPrices);
  router.post('/settings/assistant/prices/refresh', inviteLimit, requireAdmin, controller.refreshModelPrices);
  router.put('/settings/assistant/keys/:provider', inviteLimit, requireAdmin, controller.saveKey);
  router.delete('/settings/assistant/keys/:provider', writeLimit, requireAdmin, controller.deleteKey);
  return router;
}
