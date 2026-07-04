import express from 'express';
import {
  getBenchmarks,
  getBenchmarkById,
  createBenchmark,
  uploadBenchmark,
  getBenchmarkStats,
  updateBenchmark,
  deleteBenchmark
} from '../controllers/benchmarkController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  getBenchmarksQuerySchema,
  getBenchmarkStatsQuerySchema,
  createBenchmarkBodySchema,
  updateBenchmarkBodySchema
} from '../validation/benchmarkSchemas';

const router = express.Router();

// Reads are public + private (optional auth, scoped to the parent training's
// project); writes require a logged-in user.
router.get('/', optionalAuthMiddleware, validateRequest({ query: getBenchmarksQuerySchema }), getBenchmarks);
router.get('/stats', optionalAuthMiddleware, validateRequest({ query: getBenchmarkStatsQuerySchema }), getBenchmarkStats);
router.get('/:id', optionalAuthMiddleware, getBenchmarkById);
router.post('/', authMiddleware, validateRequest({ body: createBenchmarkBodySchema }), createBenchmark);
router.post('/upload', authMiddleware, validateRequest({ body: createBenchmarkBodySchema }), uploadBenchmark);
router.put('/:id', authMiddleware, validateRequest({ body: updateBenchmarkBodySchema }), updateBenchmark);
router.delete('/:id', authMiddleware, deleteBenchmark);

export default router;