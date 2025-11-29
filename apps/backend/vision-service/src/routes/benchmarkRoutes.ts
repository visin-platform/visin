import express from 'express';
import {
  getBenchmarks,
  getBenchmarkById,
  createBenchmark,
  uploadBenchmark,
  updateBenchmark,
  deleteBenchmark,
  getBenchmarkStats
} from '../controllers/benchmarkController';

const router = express.Router();

// Benchmark routes
router.get('/', getBenchmarks);
router.get('/stats', getBenchmarkStats);
router.get('/:id', getBenchmarkById);
router.post('/', createBenchmark);
router.post('/upload', uploadBenchmark);
router.put('/:id', updateBenchmark);
router.delete('/:id', deleteBenchmark);

export default router;