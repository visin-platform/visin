import { Router } from 'express';
import { validateRequest } from '@visin/backend-core';
import { forwardTo } from '../controllers/forwardController';
import { groupParamsSchema, membershipParamsSchema } from '../validation/adminSchemas';

/** Group memberships: owned by group-service, which keeps the last-owner rule. */
const router = Router();
const group = forwardTo('group');
const membership = validateRequest({ params: membershipParamsSchema });

router.get('/groups/:id', validateRequest({ params: groupParamsSchema }), group);
router.put('/memberships/:groupId/:userId', membership, group);
router.delete('/memberships/:groupId/:userId', membership, group);

export default router;
