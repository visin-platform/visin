import { Request, Response } from 'express';
import * as benchmarkService from '../services/benchmarkService';
import type { GetBenchmarksQuery, GetBenchmarkStatsQuery, CreateBenchmarkBody, UpdateBenchmarkBody } from '../validation/benchmarkSchemas';

// Get all benchmarks
export const getBenchmarks = async (req: Request, res: Response): Promise<void> => {
  const filters = req.query as unknown as GetBenchmarksQuery;

  const data = await benchmarkService.getBenchmarks(filters, req.user?.id);

  res.json({
    success: true,
    data
  });
};

// Get benchmark by ID
export const getBenchmarkById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const benchmark = await benchmarkService.getBenchmarkById(id, req.user?.id);

  res.json({
    success: true,
    data: benchmark
  });
};

// Create benchmark from JSON data
export const createBenchmark = async (req: Request, res: Response): Promise<void> => {
  const benchmarkData = req.body as CreateBenchmarkBody;

  const savedBenchmark = await benchmarkService.createBenchmark(benchmarkData, req.projectId);

  res.status(201).json({
    success: true,
    message: 'Benchmark created successfully',
    data: savedBenchmark
  });
};

// Upload benchmark from JSON file
export const uploadBenchmark = async (req: Request, res: Response): Promise<void> => {
  const benchmarkData = req.body as CreateBenchmarkBody;

  const savedBenchmark = await benchmarkService.uploadBenchmark(benchmarkData, req.projectId);

  res.status(201).json({
    success: true,
    message: 'Benchmark uploaded successfully',
    data: savedBenchmark
  });
};

// Get benchmark statistics
export const getBenchmarkStats = async (req: Request, res: Response): Promise<void> => {
  const { training_uuid } = req.query as unknown as GetBenchmarkStatsQuery;

  const stats = await benchmarkService.getBenchmarkStats(training_uuid, req.user?.id);

  res.json({
    success: true,
    data: stats
  });
};

// Update benchmark
export const updateBenchmark = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const updateData = req.body as UpdateBenchmarkBody;

  const updatedBenchmark = await benchmarkService.updateBenchmark(id, updateData, req.user?.id, req.projectId);

  res.json({
    success: true,
    message: 'Benchmark updated successfully',
    data: updatedBenchmark
  });
};

// Delete benchmark (soft delete)
export const deleteBenchmark = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  await benchmarkService.deleteBenchmark(id, req.user?.id, req.projectId);

  res.json({
    success: true,
    message: 'Benchmark deleted successfully'
  });
};
