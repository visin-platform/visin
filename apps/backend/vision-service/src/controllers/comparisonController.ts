import { Request, Response } from 'express';
import * as comparisonService from '../services/comparisonService';
import type { GetComparisonsQuery, GetComparisonStatsQuery } from '../validation/comparisonSchemas';

// Get all comparisons
export const getComparisons = async (req: Request, res: Response): Promise<void> => {
  const data = await comparisonService.getComparisons(req.query as unknown as GetComparisonsQuery, req.user?.id);

  res.json({
    success: true,
    data
  });
};

// Get comparison by ID
export const getComparisonById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const comparison = await comparisonService.getComparisonById(id, req.user?.id);

  res.json({
    success: true,
    data: comparison
  });
};

// Get comparison by UUID
export const getComparisonByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params as { uuid: string };
  const comparison = await comparisonService.getComparisonByUuid(uuid, req.user?.id);

  res.json({
    success: true,
    data: comparison
  });
};

// Create comparison
export const createComparison = async (req: Request, res: Response): Promise<void> => {
  const savedComparison = await comparisonService.createComparison(req.body, req.user?.id, req.projectId);

  res.status(201).json({
    success: true,
    message: 'Comparison created successfully',
    data: savedComparison
  });
};

// Get comparison statistics
export const getComparisonStats = async (req: Request, res: Response): Promise<void> => {
  const data = await comparisonService.getComparisonStats(
    req.query as unknown as GetComparisonStatsQuery,
    req.user?.id
  );

  res.json({
    success: true,
    data
  });
};

// Update comparison
export const updateComparison = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const updatedComparison = await comparisonService.updateComparison(id, req.body, req.user?.id);

  res.json({
    success: true,
    message: 'Comparison updated successfully',
    data: updatedComparison
  });
};

// Delete comparison (soft delete)
export const deleteComparison = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  await comparisonService.deleteComparison(id, req.user?.id);

  res.json({
    success: true,
    message: 'Comparison deleted successfully'
  });
};
