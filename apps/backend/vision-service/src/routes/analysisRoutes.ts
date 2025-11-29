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

const router = express.Router();

// POST /analysis/upload - Upload analysis JSON
router.post('/upload', uploadAnalysis);

// GET /analysis - Get all analyses with optional filtering
router.get('/', getAllAnalyses);

// GET /analysis/dataset/:name - Get analyses by dataset name
router.get('/dataset/:name', getAnalysisByDataset);

// GET /analysis/:id - Get analysis by ID
router.get('/:id', getAnalysisById);

// PUT /analysis/:id - Update analysis
router.put('/:id', updateAnalysis);

// DELETE /analysis/:id - Delete analysis
router.delete('/:id', deleteAnalysis);

// POST /analysis/compare - Compare multiple analyses
router.post('/compare', compareAnalyses);

export default router;
