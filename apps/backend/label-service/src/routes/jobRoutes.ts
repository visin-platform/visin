import { Router } from 'express';
import { asyncHandler, validateRequest } from '@visin/backend-core';
import { createJobBodySchema } from '../validation/jobSchemas';
import * as ctrl from '../controllers/jobController';

const router = Router();

router.post('/', validateRequest({ body: createJobBodySchema }), asyncHandler(ctrl.createJob));
router.get('/', asyncHandler(ctrl.listJobs));

export default router;
