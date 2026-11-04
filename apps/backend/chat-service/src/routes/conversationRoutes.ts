import { Router } from 'express';
import * as controller from '../controllers/conversationController';
import type { ChatRateLimits } from './rateLimits';

export function createConversationRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit, inviteLimit } = limits;
  router.get('/conversations', controller.listConversations);
  router.post('/conversations', inviteLimit, controller.createConversation);
  router.post('/groups/:groupId/channel', writeLimit, controller.openGroupChannel);
  router.get('/conversations/:id', controller.getConversation);
  return router;
}
