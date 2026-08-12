import { Router } from 'express';
import { asyncHandler, authenticateToken, validateRequest } from '@visin/backend-core';
import { answerBodySchema } from '../validation/taskSchemas';
import * as ctrl from '../controllers/taskController';

const router = Router();

// Looking at a frame is public; labeling it is not.
router.get('/:id', asyncHandler(ctrl.getTask));
router.post(
  '/:id/answer',
  authenticateToken,
  validateRequest({ body: answerBodySchema }),
  asyncHandler(ctrl.submitAnswer)
);
router.delete('/:id/answer', authenticateToken, asyncHandler(ctrl.undoAnswer));

export default router;
