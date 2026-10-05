import express, { Router } from 'express';
import { validateInternalServiceToken, allowUserOrInternalService, type InternalServiceRequest } from '../middleware/internalServiceAuth';
import * as ctrl from '../controllers/groupController';
import { createRateLimiter, MAX_AVATAR_BYTES, validateRequest } from '@visin/backend-core';
import {
  createGroupBodySchema,
  updateGroupBodySchema,
  createInvitationBodySchema,
  invitationTokenBodySchema,
  candidatesQuerySchema,
  updateRoleBodySchema
} from '../validation/groupSchemas';

const router = Router();

/**
 * "Add member" search, per signed-in account: enough to type a name and correct
 * it, too few to walk through the accounts on the instance.
 */
const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as InternalServiceRequest).user?.id ?? 'internal-service'
});

// Apply internal service token validation to all routes
router.use(validateInternalServiceToken);

// Thin route layer delegating to controller
router.post('/', allowUserOrInternalService, validateRequest({ body: createGroupBodySchema }), ctrl.createGroup);
router.get('/mine', allowUserOrInternalService, ctrl.listMine);
router.get('/mine/deleted', allowUserOrInternalService, ctrl.listMyDeleted);
router.get('/mine/roles', allowUserOrInternalService, ctrl.getMyGroupRoles);
router.post(
  '/invitations/preview',
  allowUserOrInternalService,
  validateRequest({ body: invitationTokenBodySchema }),
  ctrl.previewInvitation
);
router.post(
  '/invitations/accept',
  allowUserOrInternalService,
  validateRequest({ body: invitationTokenBodySchema }),
  ctrl.acceptInvitation
);
router.get('/invitations/mine', allowUserOrInternalService, ctrl.listMyInvitations);
router.post('/invitations/:invitationId/accept', allowUserOrInternalService, ctrl.acceptAccountInvitation);
router.post('/invitations/:invitationId/decline', allowUserOrInternalService, ctrl.declineAccountInvitation);
router.get(
  '/:id/candidates',
  allowUserOrInternalService,
  searchLimiter,
  validateRequest({ query: candidatesQuerySchema }),
  ctrl.findCandidates
);
router.get('/:id', allowUserOrInternalService, ctrl.getOne);
router.patch('/:id', allowUserOrInternalService, validateRequest({ body: updateGroupBodySchema }), ctrl.updateGroup);
// The picture is the request body itself, a few hundred pixels at most (the app shrinks it first). A budget of its own:
// each upload is a write.
const pictureLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as InternalServiceRequest).user?.id ?? 'internal-service'
});
router.put(
  '/:id/picture',
  allowUserOrInternalService,
  pictureLimiter,
  express.raw({ type: () => true, limit: MAX_AVATAR_BYTES }),
  ctrl.uploadPicture
);
router.delete('/:id/picture', allowUserOrInternalService, pictureLimiter, ctrl.removePicture);
router.delete('/:id', allowUserOrInternalService, ctrl.deleteGroup);
router.post('/:id/restore', allowUserOrInternalService, ctrl.restoreGroup);
router.delete('/:id/permanent', allowUserOrInternalService, ctrl.permanentlyDeleteGroup);
router.post(
  '/:id/invitations',
  allowUserOrInternalService,
  validateRequest({ body: createInvitationBodySchema }),
  ctrl.createInvitation
);
router.delete('/:id/invitations', allowUserOrInternalService, ctrl.revokeInvitations);
router.patch(
  '/:id/members/:memberId',
  allowUserOrInternalService,
  validateRequest({ body: updateRoleBodySchema }),
  ctrl.updateRole
);
router.delete('/:id/members/:memberId', allowUserOrInternalService, ctrl.removeMember);
router.get('/:id/membership', allowUserOrInternalService, ctrl.membership);
router.get('/:id/activity', allowUserOrInternalService, ctrl.activity);

export default router;
