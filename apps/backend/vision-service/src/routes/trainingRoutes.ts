import express from 'express';
import {
  heartbeatTraining,
  getTrainings,
  getTrainingById,
  getTrainingByUuid,
  getTrainingWithEpochs,
  getTrainingTags,
  createTraining,
  updateTraining,
  deleteTraining,
  getDeletedTrainings,
  restoreTraining,
  getTrainingStats,
  compareTrainings,
  addTrainingModel,
  createTrainingModelUpload,
  downloadModelBundle,
  downloadTrainingModel,
  removeTrainingModel,
  setTrainingModelDemo,
  getModelCard,
  getSummary,
  getBest
} from '../controllers/trainingController';
import { getConfigsByTraining } from '../controllers/configController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { bestRunQuerySchema } from '../validation/bestRunSchemas';
import { modelBundleQuerySchema, modelCardQuerySchema, modelDemoBodySchema, modelLinkSchema, modelUploadBodySchema } from '../validation/artifactSchemas';
import {
  getDeletedTrainingsQuerySchema,
  getTrainingsQuerySchema,
  getTrainingStatsQuerySchema,
  getTrainingWithEpochsQuerySchema,
  createTrainingBodySchema,
  updateTrainingBodySchema,
  compareTrainingsBodySchema
} from '../validation/trainingSchemas';

const router = express.Router();

// Reads are public + private (optional auth); writes require a logged-in owner.
router.get('/uuid/:uuid', optionalAuthMiddleware, getTrainingByUuid);
router.get(
  '/:id/epochs',
  optionalAuthMiddleware,
  validateRequest({ query: getTrainingWithEpochsQuerySchema }),
  getTrainingWithEpochs
);
router.get('/:id/summary', optionalAuthMiddleware, getSummary);
router.get('/:id/model-card', optionalAuthMiddleware, validateRequest({ query: modelCardQuerySchema }), getModelCard);
router.get('/:id/configs', optionalAuthMiddleware, getConfigsByTraining);
router.get('/best', optionalAuthMiddleware, validateRequest({ query: bestRunQuerySchema }), getBest);
router.get('/stats', optionalAuthMiddleware, validateRequest({ query: getTrainingStatsQuerySchema }), getTrainingStats);
// Before '/:id', or 'tags' reads as a training id.
router.get('/tags', optionalAuthMiddleware, getTrainingTags);
// A recovery list, never public: only runs the caller could restore.
router.get('/deleted', authMiddleware, validateRequest({ query: getDeletedTrainingsQuerySchema }), getDeletedTrainings);
router.get('/', optionalAuthMiddleware, validateRequest({ query: getTrainingsQuerySchema }), getTrainings);
router.get('/:id', optionalAuthMiddleware, getTrainingById);
router.post('/', authMiddleware, validateRequest({ body: createTrainingBodySchema }), createTraining);
router.put('/:id', authMiddleware, validateRequest({ body: updateTrainingBodySchema }), updateTraining);
router.delete('/:id', authMiddleware, deleteTraining);
router.post('/:id/heartbeat', authMiddleware, heartbeatTraining);
// A model file is uploaded first, then claimed by the link; a link to a Hub repo is only the second call.
router.post('/:id/models/upload-url', authMiddleware, validateRequest({ body: modelUploadBodySchema }), createTrainingModelUpload);
router.post('/:id/models', authMiddleware, validateRequest({ body: modelLinkSchema }), addTrainingModel);
router.get('/:id/models/:modelId/file', optionalAuthMiddleware, downloadTrainingModel);
router.get('/:id/models/:modelId/bundle', optionalAuthMiddleware, validateRequest({ query: modelBundleQuerySchema }), downloadModelBundle);
router.patch('/:id/models/:modelId', authMiddleware, validateRequest({ body: modelDemoBodySchema }), setTrainingModelDemo);
router.delete('/:id/models/:modelId', authMiddleware, removeTrainingModel);
router.post('/:id/restore', authMiddleware, restoreTraining);
router.post('/compare', optionalAuthMiddleware, validateRequest({ body: compareTrainingsBodySchema }), compareTrainings);

export default router;
