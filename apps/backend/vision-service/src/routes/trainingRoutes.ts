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

const router = express.Router();

// Reads are public + private (optional auth); writes require a logged-in owner.
router.get('/uuid/:uuid', optionalAuthMiddleware, getTrainingByUuid);
router.get('/:id/epochs', optionalAuthMiddleware, getTrainingWithEpochs);
router.get('/:id/configs', getConfigsByTraining);
router.get('/stats', getTrainingStats);
router.get('/', optionalAuthMiddleware, getTrainings);
router.get('/:id', optionalAuthMiddleware, getTrainingById);
router.post('/', authMiddleware, createTraining);
router.put('/:id', authMiddleware, updateTraining);
router.delete('/:id', authMiddleware, deleteTraining);
router.post('/compare', compareTrainings);

export default router;
