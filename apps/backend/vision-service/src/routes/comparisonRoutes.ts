import express from 'express';
import {
  getComparisons,
  getComparisonById,
  getComparisonByUuid,
  createComparison,
  getComparisonStats,
  updateComparison,
  deleteComparison
} from '../controllers/comparisonController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  getComparisonsQuerySchema,
  getComparisonStatsQuerySchema,
  createComparisonBodySchema,
  updateComparisonBodySchema
} from '../validation/comparisonSchemas';

const router = express.Router();

// Reads are public + private (optional auth, scoped to the comparison's
// project); writes require a logged-in user. More specific routes first!
router.get('/uuid/:uuid', optionalAuthMiddleware, getComparisonByUuid);
router.get('/stats', optionalAuthMiddleware, validateRequest({ query: getComparisonStatsQuerySchema }), getComparisonStats);
router.get('/', optionalAuthMiddleware, validateRequest({ query: getComparisonsQuerySchema }), getComparisons);
router.get('/:id', optionalAuthMiddleware, getComparisonById);
router.post('/', authMiddleware, validateRequest({ body: createComparisonBodySchema }), createComparison);
router.put('/:id', authMiddleware, validateRequest({ body: updateComparisonBodySchema }), updateComparison);
router.delete('/:id', authMiddleware, deleteComparison);

export default router;