import { Request, Response } from 'express';
import * as visualizationService from '../services/visualizationService';
import type {
  GetVisualizationsByTrainingQuery,
  GetVisualizationsByEpochQuery,
  GetVisualizationTypesQuery
} from '../validation/visualizationSchemas';

/**
 * Get upload signed URL for visualization image
 */
export const getVisualizationUploadUrl = async (req: Request, res: Response): Promise<void> => {
  const { epoch_uuid, filename, type, mimetype } = req.body;

  const data = await visualizationService.getVisualizationUploadUrl(
    { epoch_uuid, filename, type, mimetype },
    req.user?.id,
    req.projectId
  );

  res.status(200).json({
    success: true,
    data
  });
};

/**
 * Create visualization record after successful upload
 */
export const createVisualization = async (req: Request, res: Response): Promise<void> => {
  const visualization = await visualizationService.createVisualization(req.body, req.user?.id, req.projectId);

  res.status(201).json({
    success: true,
    message: 'Visualization created successfully',
    data: visualization
  });
};

/**
 * Get visualization by UUID
 */
export const getVisualizationByUuid = async (req: Request, res: Response): Promise<void> => {
  const visualization_uuid = req.params.visualization_uuid as string;

  const data = await visualizationService.getVisualizationByUuid(visualization_uuid, req.user?.id);

  res.status(200).json({
    success: true,
    data
  });
};

/**
 * Delete visualization
 */
export const deleteVisualization = async (req: Request, res: Response): Promise<void> => {
  const visualization_uuid = req.params.visualization_uuid as string;

  await visualizationService.deleteVisualization(visualization_uuid, req.user?.id, req.projectId);

  res.status(200).json({
    success: true,
    message: 'Visualization deleted successfully'
  });
};

/**
 * Get visualizations by epoch UUID
 */
export const getVisualizationsByEpoch = async (req: Request, res: Response): Promise<void> => {
  const epoch_uuid = req.params.epoch_uuid as string;
  const { type } = req.query as unknown as GetVisualizationsByEpochQuery;

  const data = await visualizationService.getVisualizationsByEpoch(epoch_uuid, type, req.user?.id);

  res.status(200).json({
    success: true,
    data
  });
};

/**
 * Get visualizations by training UUID
 */
export const getVisualizationsByTraining = async (req: Request, res: Response): Promise<void> => {
  const training_uuid = req.params.training_uuid as string;
  const filters = req.query as unknown as GetVisualizationsByTrainingQuery;

  const data = await visualizationService.getVisualizationsByTraining(training_uuid, filters, req.user?.id);

  res.status(200).json({
    success: true,
    data
  });
};

/**
 * Get visualization types (distinct types across all visualizations)
 */
export const getVisualizationTypes = async (req: Request, res: Response): Promise<void> => {
  const { training_uuid, epoch_uuid } = req.query as unknown as GetVisualizationTypesQuery;

  const types = await visualizationService.getVisualizationTypes(training_uuid, epoch_uuid, req.user?.id);

  res.status(200).json({
    success: true,
    data: {
      types
    }
  });
};
