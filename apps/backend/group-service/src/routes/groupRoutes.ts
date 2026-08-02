import { Router } from 'express';
import { validateInternalServiceToken, allowUserOrInternalService } from '../middleware/internalServiceAuth';
import * as ctrl from '../controllers/groupController';
import { validateRequest } from '@visin/backend-core';
import {
  createGroupBodySchema,
  updateGroupBodySchema,
  addMemberBodySchema,
  updateRoleBodySchema
} from '../validation/groupSchemas';

const router = Router();

// Apply internal service token validation to all routes
router.use(validateInternalServiceToken);

// Thin route layer delegating to controller
router.post('/', allowUserOrInternalService, validateRequest({ body: createGroupBodySchema }), ctrl.createGroup);
router.get('/mine', allowUserOrInternalService, ctrl.listMine);
router.get('/mine/deleted', allowUserOrInternalService, ctrl.listMyDeleted);
router.get('/mine/roles', allowUserOrInternalService, ctrl.getMyGroupRoles);
router.get('/:id', allowUserOrInternalService, ctrl.getOne);
router.patch('/:id', allowUserOrInternalService, validateRequest({ body: updateGroupBodySchema }), ctrl.updateGroup);
router.delete('/:id', allowUserOrInternalService, ctrl.deleteGroup);
router.post('/:id/restore', allowUserOrInternalService, ctrl.restoreGroup);
router.delete('/:id/permanent', allowUserOrInternalService, ctrl.permanentlyDeleteGroup);
router.post('/:id/members', allowUserOrInternalService, validateRequest({ body: addMemberBodySchema }), ctrl.addMember);
router.patch(
  '/:id/members/:memberEmail',
  allowUserOrInternalService,
  validateRequest({ body: updateRoleBodySchema }),
  ctrl.updateRole
);
router.delete('/:id/members/:memberEmail', allowUserOrInternalService, ctrl.removeMember);
router.get('/:id/membership', allowUserOrInternalService, ctrl.membership);

export default router;
