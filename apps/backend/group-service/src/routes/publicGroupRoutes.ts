import { Router } from 'express';
import { createRateLimiter, validateRequest } from '@visin/backend-core';
import { getPublic, getShare, searchPublic } from '../controllers/publicGroupController';
import { groupsSearchQuerySchema, handleParamsSchema } from '../validation/groupSchemas';

const router = Router();

/** Read by anyone, so a crawler gets a budget of its own rather than the shared one. */
const publicLimiter = createRateLimiter({ max: 120 });

router.get('/groups', publicLimiter, validateRequest({ query: groupsSearchQuerySchema }), searchPublic);
router.get('/share/groups/:handle', publicLimiter, validateRequest({ params: handleParamsSchema }), getShare);
router.get('/groups/:handle', publicLimiter, validateRequest({ params: handleParamsSchema }), getPublic);

export default router;
