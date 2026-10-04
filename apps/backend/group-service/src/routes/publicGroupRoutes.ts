import { Router } from 'express';
import { createRateLimiter, validateRequest } from '@visin/backend-core';
import { getPublic } from '../controllers/publicGroupController';
import { handleParamsSchema } from '../validation/groupSchemas';

const router = Router();

/** Read by anyone, so a crawler gets a budget of its own rather than the shared one. */
const publicLimiter = createRateLimiter({ max: 120 });

router.get('/groups/:handle', publicLimiter, validateRequest({ params: handleParamsSchema }), getPublic);

export default router;
