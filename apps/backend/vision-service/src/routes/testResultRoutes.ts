import express from 'express';
import {
  getTestResults,
  getTestResultById,
  getTestResultByTestUuid,
  createTestResult,
  createTestResultFromJson,
  updateTestResult,
  deleteTestResult,
  getTestResultEpochs,
  compareTestResults,
  compareAggregatedTestResultsByTraining
} from '../controllers/testResultController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  getTestResultsQuerySchema,
  createTestResultBodySchema,
  updateTestResultBodySchema,
  compareTestResultsBodySchema,
  compareAggregatedTestResultsBodySchema
} from '../validation/testResultSchemas';

const router = express.Router();

// Reads are public + private (optional auth, scoped to the parent training's
// project); writes require a logged-in user.
router.get('/', optionalAuthMiddleware, validateRequest({ query: getTestResultsQuerySchema }), getTestResults);
router.get('/epochs', getTestResultEpochs);
router.get('/:id', optionalAuthMiddleware, getTestResultById);
router.get('/test/:testUuid', optionalAuthMiddleware, getTestResultByTestUuid);
router.post('/', authMiddleware, validateRequest({ body: createTestResultBodySchema }), createTestResult);
router.post('/upload', authMiddleware, validateRequest({ body: createTestResultBodySchema }), createTestResultFromJson);
router.post('/compare', optionalAuthMiddleware, validateRequest({ body: compareTestResultsBodySchema }), compareTestResults);
router.post(
  '/compare/aggregated',
  optionalAuthMiddleware,
  validateRequest({ body: compareAggregatedTestResultsBodySchema }),
  compareAggregatedTestResultsByTraining
);
router.put('/:id', authMiddleware, validateRequest({ body: updateTestResultBodySchema }), updateTestResult);
router.delete('/:id', authMiddleware, deleteTestResult);

export default router;