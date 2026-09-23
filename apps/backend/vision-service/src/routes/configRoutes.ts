import express from 'express';
import {
  getAllConfigs,
  getConfigById,
  getConfigByUuid,
  createConfig,
  createConfigFromJson
} from '../controllers/configController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { getAllConfigsQuerySchema, createConfigBodySchema, createConfigFromJsonBodySchema } from '../validation/configSchemas';

const router = express.Router();

// Configs are a shared library, so reads stay public, except a config only
// private trainings use (see configService). Writes require a logged-in user.
// More specific routes first!
router.get('/uuid/:uuid', optionalAuthMiddleware, getConfigByUuid);
router.get('/', optionalAuthMiddleware, validateRequest({ query: getAllConfigsQuerySchema }), getAllConfigs);
router.get('/:id', optionalAuthMiddleware, getConfigById);

// Create routes
router.post('/upload', authMiddleware, validateRequest({ body: createConfigFromJsonBodySchema }), createConfigFromJson);
router.post('/', authMiddleware, validateRequest({ body: createConfigBodySchema }), createConfig);

export default router;
