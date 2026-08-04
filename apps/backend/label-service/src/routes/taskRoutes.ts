import { Router } from 'express';
import { asyncHandler, validateRequest } from '@visin/backend-core';
import { answerBodySchema } from '../validation/taskSchemas';
import * as ctrl from '../controllers/taskController';

const router = Router();

router.get('/:id', asyncHandler(ctrl.getTask));
router.post('/:id/answer', validateRequest({ body: answerBodySchema }), asyncHandler(ctrl.submitAnswer));
router.delete('/:id/answer', asyncHandler(ctrl.undoAnswer));

export default router;
