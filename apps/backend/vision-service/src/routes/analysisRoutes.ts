import express from 'express';
import {
  uploadAnalysis,
  getAllAnalyses,
  getAnalysisById,
  updateAnalysis,
  getAnalysisByDataset,
  deleteAnalysis,
  compareAnalyses
} from '../controllers/analysisController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  uploadAnalysisBodySchema,
  updateAnalysisBodySchema,
  getAllAnalysesQuerySchema,
  getAnalysisByDatasetQuerySchema,
  compareAnalysesBodySchema
} from '../validation/analysisSchemas';

const router = express.Router();

// POST /analysis/upload - Upload analysis JSON
router.post('/upload', authMiddleware, validateRequest({ body: uploadAnalysisBodySchema }), uploadAnalysis);

// GET /analysis - Get all analyses with optional filtering
router.get('/', validateRequest({ query: getAllAnalysesQuerySchema }), getAllAnalyses);

// GET /analysis/dataset/:name - Get analyses by dataset name
router.get('/dataset/:name', validateRequest({ query: getAnalysisByDatasetQuerySchema }), getAnalysisByDataset);

// GET /analysis/:id - Get analysis by ID
router.get('/:id', getAnalysisById);

// PUT /analysis/:id - Update analysis
router.put('/:id', authMiddleware, validateRequest({ body: updateAnalysisBodySchema }), updateAnalysis);

// DELETE /analysis/:id - Delete analysis
router.delete('/:id', authMiddleware, deleteAnalysis);

// POST /analysis/compare - Compare multiple analyses
router.post('/compare', validateRequest({ body: compareAnalysesBodySchema }), compareAnalyses);

export default router;
