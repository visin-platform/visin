import express from 'express';
import {
  getAllConfigs,
  getConfigsByTraining,
  getConfigById,
  getConfigByUuid,
  createConfig,
  updateConfig,
  deleteConfig,
  createConfigFromJson,
  createConfigsBatch
} from '../controllers/configController';

const router = express.Router();

// More specific routes first!
router.get('/uuid/:uuid', getConfigByUuid);
router.get('/training/:trainingId', getConfigsByTraining);
router.get('/', getAllConfigs);
router.get('/:id', getConfigById);

// Create routes
router.post('/upload', createConfigFromJson);
router.post('/batch', createConfigsBatch);
router.post('/', createConfig);

// Update and delete routes
router.put('/:id', updateConfig);
router.delete('/:id', deleteConfig);

export default router;
