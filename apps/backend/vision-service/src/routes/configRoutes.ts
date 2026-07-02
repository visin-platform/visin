import express from 'express';
import {
  getAllConfigs,
  getConfigById,
  getConfigByUuid,
  createConfig,
  createConfigFromJson
} from '../controllers/configController';

const router = express.Router();

// More specific routes first!
router.get('/uuid/:uuid', getConfigByUuid);
router.get('/', getAllConfigs);
router.get('/:id', getConfigById);

// Create routes
router.post('/upload', createConfigFromJson);
router.post('/', createConfig);

export default router;
