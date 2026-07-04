import express from 'express';
import {
  getVisualizationUploadUrl,
  createVisualization,
  getVisualizationsByEpoch,
  getVisualizationsByTraining,
  getVisualizationByUuid,
  deleteVisualization,
  getVisualizationTypes
} from '../controllers/visualizationController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  getVisualizationUploadUrlBodySchema,
  createVisualizationBodySchema,
  getVisualizationsByEpochQuerySchema,
  getVisualizationsByTrainingQuerySchema,
  getVisualizationTypesQuerySchema
} from '../validation/visualizationSchemas';

const router = express.Router();

// Reads are public + private (optional auth, scoped to the parent training's
// project); writes require a logged-in user.
router.post(
  '/upload-url',
  authMiddleware,
  validateRequest({ body: getVisualizationUploadUrlBodySchema }),
  getVisualizationUploadUrl
);
router.post('/', authMiddleware, validateRequest({ body: createVisualizationBodySchema }), createVisualization);
router.get(
  '/epoch/:epoch_uuid',
  optionalAuthMiddleware,
  validateRequest({ query: getVisualizationsByEpochQuerySchema }),
  getVisualizationsByEpoch
);
router.get(
  '/training/:training_uuid',
  optionalAuthMiddleware,
  validateRequest({ query: getVisualizationsByTrainingQuerySchema }),
  getVisualizationsByTraining
);
// For fetching all visualizations
router.get(
  '/training',
  optionalAuthMiddleware,
  validateRequest({ query: getVisualizationsByTrainingQuerySchema }),
  getVisualizationsByTraining
);
router.get('/types', optionalAuthMiddleware, validateRequest({ query: getVisualizationTypesQuerySchema }), getVisualizationTypes);
router.get('/:visualization_uuid', optionalAuthMiddleware, getVisualizationByUuid);
router.delete('/:visualization_uuid', authMiddleware, deleteVisualization);

export default router;
