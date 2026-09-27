import { Router } from 'express';
import { requireInternalServiceToken, validateRequest } from '@visin/backend-core';
import { getKeyAccess, getOwnedByGroup } from '../controllers/internalController';
import { keyAccessQuerySchema } from '../validation/internalSchemas';

/** Service-to-service only: every route here needs the internal service token. */
const router = Router();
router.use(requireInternalServiceToken);

router.get('/projects/:id/key-access', validateRequest({ query: keyAccessQuerySchema }), getKeyAccess);
router.get('/groups/:groupId/owned', getOwnedByGroup);

export default router;
