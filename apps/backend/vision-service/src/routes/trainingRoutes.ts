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
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

router.get('/uuid/:uuid', getTrainingByUuid);
router.get('/:id/epochs', getTrainingWithEpochs);
router.get('/stats', getTrainingStats);
router.get('/', getTrainings);
router.get('/:id', getTrainingById);
router.post('/', createTraining);
router.put('/:id', updateTraining);
router.delete('/:id', deleteTraining);
router.post('/compare', compareTrainings);

export default router;
