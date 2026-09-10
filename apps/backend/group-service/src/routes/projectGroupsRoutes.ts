import { Router } from 'express';
import { validateRequest } from '@visin/backend-core';
import { getProjectGroups } from '../controllers/projectGroupsController';
import { projectGroupsBodySchema } from '../validation/projectGroupsSchemas';

const router = Router();
router.post('/', validateRequest({ body: projectGroupsBodySchema }), getProjectGroups);

export default router;
