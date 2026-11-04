import { Router } from 'express';
import * as controller from '../controllers/membershipController';
import type { ChatRateLimits } from './rateLimits';

export function createMembershipRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { writeLimit, inviteLimit } = limits;
  router.post('/conversations/:id/membership', writeLimit, controller.updateMembership);
  router.post('/conversations/:id/participants', inviteLimit, controller.inviteParticipant);
  router.post('/conversations/:id/remove-participant', writeLimit, controller.removeParticipant);
  return router;
}
