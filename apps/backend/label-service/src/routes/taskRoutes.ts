import express, { Router } from 'express';
import { asyncHandler, authenticateToken, validateRequest } from '@visin/backend-core';
import { finishBodySchema, saveAnnotationBodySchema } from '../validation/taskSchemas';
import * as ctrl from '../controllers/taskController';

const router = Router();

// Looking at a frame is public; labeling it is not.
router.get('/:id', asyncHandler(ctrl.getTask));
router.put(
  '/:id/annotation',
  authenticateToken,
  validateRequest({ body: saveAnnotationBodySchema }),
  asyncHandler(ctrl.saveAnnotation)
);
// The mask is run-length bytes, not JSON (utils/mask.ts): a megapixel frame's
// worth of class indices is a few kilobytes that way.
router.put(
  '/:id/annotation/mask',
  authenticateToken,
  express.raw({ type: 'application/octet-stream', limit: '8mb' }),
  asyncHandler(ctrl.saveMask)
);
router.delete('/:id/annotation/mask', authenticateToken, asyncHandler(ctrl.clearMask));
router.post('/:id/annotation/done', authenticateToken, validateRequest({ body: finishBodySchema }), asyncHandler(ctrl.finishDone));
router.post('/:id/annotation/skip', authenticateToken, validateRequest({ body: finishBodySchema }), asyncHandler(ctrl.finishSkip));

export default router;
