import { Router } from 'express';
import { requireInternalServiceToken, validateRequest } from '@visin/backend-core';
import { lookupPublic } from '../controllers/publicGroupController';
import { publicGroupsBodySchema } from '../validation/groupSchemas';

const router = Router();

// Service callers only: vision- and dataset-service, naming the owners of what they list.
router.post('/public', requireInternalServiceToken, validateRequest({ body: publicGroupsBodySchema }), lookupPublic);

export default router;
