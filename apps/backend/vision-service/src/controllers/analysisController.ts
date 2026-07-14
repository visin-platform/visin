import { Request, Response } from 'express';
import * as analysisService from '../services/analysisService';
import type { GetAllAnalysesQuery, GetAnalysisByDatasetQuery } from '../validation/analysisSchemas';

/**
 * Upload dataset analysis JSON
 * POST /analysis/upload
 */
export const uploadAnalysis = async (req: Request, res: Response): Promise<void> => {
  const analysis = await analysisService.uploadAnalysis(req.body);

  res.status(201).json({
    success: true,
    message: 'Analysis uploaded successfully',
    data: analysis
  });
};

/**
 * Get all analyses
 * GET /analysis
 */
export const getAllAnalyses = async (req: Request, res: Response): Promise<void> => {
  const { dataset, limit, skip } = req.query as unknown as GetAllAnalysesQuery;
  const { analyses, pagination } = await analysisService.getAllAnalyses({ dataset, limit, skip });

  res.json({
    success: true,
    data: analyses,
    pagination
  });
};

/**
 * Get analysis by ID
 * GET /analysis/:id
 */
export const getAnalysisById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const analysis = await analysisService.getAnalysisById(id);

  res.json({
    success: true,
    data: analysis
  });
};

/**
 * Update analysis by ID
 * PUT /analysis/:id
 */
export const updateAnalysis = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const analysis = await analysisService.updateAnalysis(id, req.body);

  res.json({
    success: true,
    message: 'Analysis updated successfully',
    data: analysis
  });
};

/**
 * Get analyses by dataset name
 * GET /analysis/dataset/:name
 */
export const getAnalysisByDataset = async (req: Request, res: Response): Promise<void> => {
  const { name } = req.params as { name: string };
  const { limit, skip } = req.query as unknown as GetAnalysisByDatasetQuery;
  const { analyses, pagination } = await analysisService.getAnalysisByDataset(name, { limit, skip });

  res.json({
    success: true,
    data: analyses,
    pagination
  });
};

/**
 * Delete analysis by ID
 * DELETE /analysis/:id
 */
export const deleteAnalysis = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  await analysisService.deleteAnalysis(id);

  res.json({
    success: true,
    message: 'Analysis deleted successfully'
  });
};

/**
 * Compare multiple analyses
 * POST /analysis/compare
 */
export const compareAnalyses = async (req: Request, res: Response): Promise<void> => {
  const { analysisIds } = req.body;
  const data = await analysisService.compareAnalyses(analysisIds);

  res.json({
    success: true,
    data
  });
};
