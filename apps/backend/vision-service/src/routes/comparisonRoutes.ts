import express from 'express';
import {
  getComparisons,
  getComparisonById,
  getComparisonByUuid,
  createComparison,
  getComparisonStats
} from '../controllers/comparisonController';

const router = express.Router();

// Comparison routes - more specific routes first!
router.get('/uuid/:uuid', getComparisonByUuid);
router.get('/stats', getComparisonStats);
router.get('/', getComparisons);
router.get('/:id', getComparisonById);
router.post('/', createComparison);

export default router;