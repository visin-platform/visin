import { authenticateToken } from '@visin/backend-core';
import { Router } from 'express';
import { createAttachmentRoutes } from './attachmentRoutes';
import { createCallRoutes } from './callRoutes';
import { createConversationRoutes } from './conversationRoutes';
import { createDiscoveryRoutes } from './discoveryRoutes';
import { createAssistantInternalRoutes } from './assistantInternalRoutes';
import { createInternalRoutes } from './internalRoutes';
import { createMembershipRoutes } from './membershipRoutes';
import { createMessageRoutes } from './messageRoutes';
import { createPushRoutes } from './pushRoutes';
import { createChatRateLimits } from './rateLimits';
import { createRunRoutes } from './runRoutes';
import { createStreamRoutes } from './streamRoutes';

export function createChatRoutes() {
  const router = Router();
  const limits = createChatRateLimits();
  router.use(createInternalRoutes());
  router.use(createAssistantInternalRoutes());
  router.use(authenticateToken);
  router.use(createDiscoveryRoutes(limits));
  router.use(createConversationRoutes(limits));
  router.use(createMembershipRoutes(limits));
  router.use(createMessageRoutes(limits));
  router.use(createAttachmentRoutes(limits));
  router.use(createPushRoutes(limits));
  router.use(createCallRoutes(limits));
  router.use(createRunRoutes());
  router.use(createStreamRoutes());
  return router;
}
