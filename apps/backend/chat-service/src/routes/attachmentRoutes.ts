import { Router } from 'express';
import * as controller from '../controllers/attachmentController';
import type { ChatRateLimits } from './rateLimits';

export function createAttachmentRoutes(limits: ChatRateLimits) {
  const router = Router();
  router.post('/conversations/:id/attachments', limits.uploadLimit, controller.ticket);
  router.post('/conversations/:id/attachment-urls', controller.urls);
  return router;
}
