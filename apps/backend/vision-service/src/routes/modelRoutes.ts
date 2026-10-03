import express from 'express';
import { validateRequest } from '@visin/backend-core';
import { getModels } from '../controllers/modelRegistryController';
import { optionalAuthMiddleware } from '../middleware/authMiddleware';
import { listModelsQuerySchema } from '../validation/modelRegistrySchemas';

const router = express.Router();

// Public and private runs alike, as the trainings list: what the caller may see.
router.get('/', optionalAuthMiddleware, validateRequest({ query: listModelsQuerySchema }), getModels);

export default router;
