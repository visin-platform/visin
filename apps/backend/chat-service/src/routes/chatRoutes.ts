import { authenticateToken } from '@visin/backend-core';
import { Router } from 'express';
import { createAssistantAdminRoutes } from './assistantAdminRoutes';
import { createAssistantRoutes } from './assistantRoutes';
import { createConversationRoutes } from './conversationRoutes';
import { createDiscoveryRoutes } from './discoveryRoutes';
import { createFindingRoutes } from './findingRoutes';
import { createMembershipRoutes } from './membershipRoutes';
import { createMessageRoutes } from './messageRoutes';
import { createChatRateLimits } from './rateLimits';
import { createRunRoutes } from './runRoutes';
import { createSharedAssistantRoutes } from './sharedAssistantRoutes';
import { createStreamRoutes } from './streamRoutes';

export function createChatRoutes() {
  const router = Router();
  const limits = createChatRateLimits();
  router.use(authenticateToken);
  router.use(createAssistantRoutes(limits));
  router.use(createDiscoveryRoutes(limits));
  router.use(createAssistantAdminRoutes(limits));
  router.use(createConversationRoutes(limits));
  router.use(createSharedAssistantRoutes(limits));
  router.use(createMembershipRoutes(limits));
  router.use(createMessageRoutes(limits));
  router.use(createRunRoutes(limits));
  router.use(createFindingRoutes(limits));
  router.use(createStreamRoutes());
  return router;
}
