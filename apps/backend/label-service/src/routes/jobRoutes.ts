import { Router } from 'express';
import { asyncHandler, authenticateToken, validateRequest } from '@visin/backend-core';
import { createJobBodySchema, listJobsQuerySchema, materializeBodySchema } from '../validation/jobSchemas';
import { nextBodySchema, taskAtParamsSchema } from '../validation/taskSchemas';
import * as ctrl from '../controllers/jobController';
import * as taskCtrl from '../controllers/taskController';

const router = Router();

// Reading a job is public (see index.ts); everything that changes one, leases a
// task, or emits collected labels carries `authenticateToken` so an anonymous
// caller is turned away at the door rather than inside a controller.
router.post('/', authenticateToken, validateRequest({ body: createJobBodySchema }), asyncHandler(ctrl.createJob));
router.get('/', validateRequest({ query: listJobsQuerySchema }), asyncHandler(ctrl.listJobs));
router.get('/:id', asyncHandler(ctrl.getJob));
// Destructive: job + tasks + answers. `archive` only hides a job from workers.
router.delete('/:id', authenticateToken, asyncHandler(ctrl.deleteJob));
router.post(
  '/:id/materialize',
  authenticateToken,
  validateRequest({ body: materializeBodySchema }),
  asyncHandler(ctrl.materializeTasks)
);
router.post('/:id/activate', authenticateToken, asyncHandler(ctrl.activateJob));
router.post('/:id/pause', authenticateToken, asyncHandler(ctrl.pauseJob));
router.post('/:id/resume', authenticateToken, asyncHandler(ctrl.resumeJob));
router.post('/:id/archive', authenticateToken, asyncHandler(ctrl.archiveJob));
router.post(
  '/:id/next',
  authenticateToken,
  validateRequest({ body: nextBodySchema }),
  asyncHandler(taskCtrl.nextTask)
);
// Stepping through the job's frames in order — public, unlike `next`, which
// takes a lease and therefore needs a labeler to lease to.
router.get(
  '/:id/tasks/at/:index',
  validateRequest({ params: taskAtParamsSchema }),
  asyncHandler(taskCtrl.getTaskAtIndex)
);
// The collected labels themselves, not progress about them: stays admin-only.
router.get('/:id/export', authenticateToken, asyncHandler(ctrl.exportJob));
router.get('/:id/stats', asyncHandler(ctrl.jobStats));

export default router;
