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
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  getEpochsByTrainingQuerySchema,
  createEpochBodySchema,
  updateEpochBodySchema,
  createEpochFromJsonBodySchema,
  createEpochsBatchBodySchema
} from '../validation/epochSchemas';
import { getTestResultsByEpochUuidQuerySchema } from '../validation/testResultSchemas';

const router = express.Router();

// Reads are public + private (optional auth, scoped to the parent training's
// project); writes require a logged-in user with access to that project.
router.get(
  '/training/:trainingId',
  optionalAuthMiddleware,
  validateRequest({ query: getEpochsByTrainingQuerySchema }),
  getEpochsByTraining
);
router.get(
  '/uuid/:uuid/test-results',
  optionalAuthMiddleware,
  validateRequest({ query: getTestResultsByEpochUuidQuerySchema }),
  getTestResultsByEpochUuid
);
router.get('/:id', optionalAuthMiddleware, getEpochById);
router.get('/uuid/:uuid', optionalAuthMiddleware, getEpochByUuid);
router.post('/', authMiddleware, validateRequest({ body: createEpochBodySchema }), createEpoch);
router.post('/upload', authMiddleware, validateRequest({ body: createEpochFromJsonBodySchema }), createEpochFromJson);
router.post('/batch', authMiddleware, validateRequest({ body: createEpochsBatchBodySchema }), createEpochsBatch);
router.put('/:id', authMiddleware, validateRequest({ body: updateEpochBodySchema }), updateEpoch);

export default router;
