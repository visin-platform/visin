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

const router = express.Router();

// Training routes - more specific routes first!
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
