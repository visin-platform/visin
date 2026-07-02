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

const router = express.Router();

// Test result routes
router.get('/', getTestResults);
router.get('/epochs', getTestResultEpochs);
router.get('/:id', getTestResultById);
router.get('/test/:testUuid', getTestResultByTestUuid);
router.post('/', createTestResult);
router.post('/upload', createTestResultFromJson);
router.post('/compare', compareTestResults);
router.post('/compare/aggregated', compareAggregatedTestResultsByTraining);
router.put('/:id', updateTestResult);
router.delete('/:id', deleteTestResult);

export default router;