import express from 'express';
import {
  getAllConfigs,
  getConfigById,
  getConfigByUuid,
  createConfig,
  createConfigFromJson
} from '../controllers/configController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { getAllConfigsQuerySchema, createConfigBodySchema, createConfigFromJsonBodySchema } from '../validation/configSchemas';

const router = express.Router();

// Configs are a shared library (no owner/project scoping), so reads stay
// public; writes require a logged-in user. More specific routes first!
router.get('/uuid/:uuid', getConfigByUuid);
router.get('/', validateRequest({ query: getAllConfigsQuerySchema }), getAllConfigs);
router.get('/:id', getConfigById);

// Create routes
router.post('/upload', authMiddleware, validateRequest({ body: createConfigFromJsonBodySchema }), createConfigFromJson);
router.post('/', authMiddleware, validateRequest({ body: createConfigBodySchema }), createConfig);

export default router;
