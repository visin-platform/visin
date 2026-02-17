import express from 'express';
import {
  getEpochsByTraining,
  getEpochById,
  getEpochByUuid,
  createEpoch,
  createEpochFromJson,
  updateEpoch,
  createEpochsBatch
} from '../controllers/epochController';
import { getTestResultsByEpochUuid } from '../controllers/testResultController';

const router = express.Router();

// Epoch routes
router.get('/training/:trainingId', getEpochsByTraining);
router.get('/uuid/:uuid/test-results', getTestResultsByEpochUuid);
router.get('/:id', getEpochById);
router.get('/uuid/:uuid', getEpochByUuid);
router.post('/', createEpoch);
router.post('/upload', createEpochFromJson);
router.post('/batch', createEpochsBatch);
router.put('/:id', updateEpoch);

export default router;
