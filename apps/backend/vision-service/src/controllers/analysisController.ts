import { Request, Response } from 'express';
import { QueryFilter } from 'mongoose';
import { NotFoundError, logger } from '@visin/backend-core';
import DatasetAnalysis, { IDatasetAnalysis } from '../models/DatasetAnalysis';
import type { GetAllAnalysesQuery, GetAnalysisByDatasetQuery } from '../validation/analysisSchemas';

/**
 * Upload dataset analysis JSON
 * POST /analysis/upload
 */
export const uploadAnalysis = async (req: Request, res: Response): Promise<void> => {
  const analysisData = req.body;

  // Create new analysis record
  const analysis = new DatasetAnalysis({
    dataset: analysisData.dataset,
    size: analysisData.size,
    data: {
      ...analysisData.data,
      downloadUrl: analysisData.downloadUrl
    }
  });

  await analysis.save();

  logger.info('Dataset analysis uploaded', { dataset: analysisData.dataset, id: analysis._id });

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

  const query: QueryFilter<IDatasetAnalysis> = {};
  if (dataset) {
    query.dataset = dataset;
  }

  const total = await DatasetAnalysis.countDocuments(query);
  const analyses = await DatasetAnalysis.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);

  // Add downloadUrl to top level for easier access
  const analysesWithDownloadUrl = analyses.map(analysis => ({
    ...analysis.toObject(),
    downloadUrl: analysis.data?.downloadUrl
  }));

  res.json({
    success: true,
    data: analysesWithDownloadUrl,
    pagination: {
      total,
      limit,
      skip
    }
  });
};

/**
 * Get analysis by ID
 * GET /analysis/:id
 */
export const getAnalysisById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const analysis = await DatasetAnalysis.findById(id);
  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }

  res.json({
    success: true,
    data: {
      ...analysis.toObject(),
      downloadUrl: analysis.data?.downloadUrl
    }
  });
};

/**
 * Update analysis by ID
 * PUT /analysis/:id
 */
export const updateAnalysis = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updateData = req.body;

  const analysis = await DatasetAnalysis.findByIdAndUpdate(
    id,
    {
      dataset: updateData.dataset,
      size: updateData.size,
      data: updateData.data
    },
    { new: true }
  );

  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }

  logger.info('Dataset analysis updated', { id: analysis._id, dataset: analysis.dataset });

  res.json({
    success: true,
    message: 'Analysis updated successfully',
    data: {
      ...analysis.toObject(),
      downloadUrl: analysis.data?.downloadUrl
    }
  });
};

/**
 * Get analyses by dataset name
 * GET /analysis/dataset/:name
 */
export const getAnalysisByDataset = async (req: Request, res: Response): Promise<void> => {
  const { name } = req.params;
  const { limit, skip } = req.query as unknown as GetAnalysisByDatasetQuery;

  const total = await DatasetAnalysis.countDocuments({ dataset: name });
  const analyses = await DatasetAnalysis.find({ dataset: name })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);

  res.json({
    success: true,
    data: analyses,
    pagination: {
      total,
      limit,
      skip
    }
  });
};

/**
 * Delete analysis by ID
 * DELETE /analysis/:id
 */
export const deleteAnalysis = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const analysis = await DatasetAnalysis.findByIdAndDelete(id);
  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }

  logger.info('Dataset analysis deleted', { id: analysis._id });

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

  // Fetch analyses
  const analyses = await DatasetAnalysis.find({ _id: { $in: analysisIds } })
    .sort({ timestamp: -1 });

  // Calculate comparison data for each analysis
  const comparisonData = analyses.map(analysis => {
    return {
      analysis: {
        _id: analysis._id,
        dataset: analysis.dataset,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt
      },
      data: analysis.data
    };
  });

  res.json({
    success: true,
    data: {
      comparison: comparisonData,
      summary: {
        totalAnalyses: analyses.length,
        datasets: [...new Set(analyses.map(a => a.dataset))]
      }
    }
  });
};
