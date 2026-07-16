import { Router } from 'express';
import { asyncHandler, validateRequest } from '@visin/backend-core';
import { createJobBodySchema, listJobsQuerySchema, materializeBodySchema } from '../validation/jobSchemas';
import * as ctrl from '../controllers/jobController';
import * as taskCtrl from '../controllers/taskController';

const router = Router();

router.post('/', validateRequest({ body: createJobBodySchema }), asyncHandler(ctrl.createJob));
router.get('/', validateRequest({ query: listJobsQuerySchema }), asyncHandler(ctrl.listJobs));
router.get('/:id', asyncHandler(ctrl.getJob));
router.post('/:id/materialize', validateRequest({ body: materializeBodySchema }), asyncHandler(ctrl.materializeTasks));
router.post('/:id/activate', asyncHandler(ctrl.activateJob));
router.post('/:id/pause', asyncHandler(ctrl.pauseJob));
router.post('/:id/resume', asyncHandler(ctrl.resumeJob));
router.post('/:id/archive', asyncHandler(ctrl.archiveJob));
router.post('/:id/next', asyncHandler(taskCtrl.nextTask));
router.get('/:id/export', asyncHandler(ctrl.exportJob));
router.get('/:id/stats', asyncHandler(ctrl.jobStats));

export default router;
