import express from 'express';
import {
  getEpochsByTraining,
  getEpochById,
  getEpochByUuid,
  createEpoch,
  createEpochFromJson,
  updateEpoch,
  deleteEpoch,
  createEpochsBatch
} from '../controllers/epochController';

const router = express.Router();

// Epoch routes
router.get('/training/:trainingId', getEpochsByTraining);
router.get('/:id', getEpochById);
router.get('/uuid/:uuid', getEpochByUuid);
router.post('/', createEpoch);
router.post('/upload', createEpochFromJson);
router.post('/batch', createEpochsBatch);
router.put('/:id', updateEpoch);
router.delete('/:id', deleteEpoch);

export default router;
