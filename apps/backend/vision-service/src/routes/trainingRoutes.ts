import express from 'express';
import {
  getTrainings,
  getTrainingById,
  getTrainingByUuid,
  getTrainingWithEpochs,
  createTraining,
  updateTraining,
  deleteTraining,
  getTrainingStats,
  compareTrainings
} from '../controllers/trainingController';
import { getConfigsByTraining } from '../controllers/configController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  getTrainingsQuerySchema,
  getTrainingStatsQuerySchema,
  getTrainingWithEpochsQuerySchema,
  createTrainingBodySchema,
  updateTrainingBodySchema,
  compareTrainingsBodySchema
} from '../validation/trainingSchemas';

const router = express.Router();

// Reads are public + private (optional auth); writes require a logged-in owner.
router.get('/uuid/:uuid', optionalAuthMiddleware, getTrainingByUuid);
router.get(
  '/:id/epochs',
  optionalAuthMiddleware,
  validateRequest({ query: getTrainingWithEpochsQuerySchema }),
  getTrainingWithEpochs
);
router.get('/:id/configs', getConfigsByTraining);
router.get('/stats', optionalAuthMiddleware, validateRequest({ query: getTrainingStatsQuerySchema }), getTrainingStats);
router.get('/', optionalAuthMiddleware, validateRequest({ query: getTrainingsQuerySchema }), getTrainings);
router.get('/:id', optionalAuthMiddleware, getTrainingById);
router.post('/', authMiddleware, validateRequest({ body: createTrainingBodySchema }), createTraining);
router.put('/:id', authMiddleware, validateRequest({ body: updateTrainingBodySchema }), updateTraining);
router.delete('/:id', authMiddleware, deleteTraining);
router.post('/compare', optionalAuthMiddleware, validateRequest({ body: compareTrainingsBodySchema }), compareTrainings);

export default router;
