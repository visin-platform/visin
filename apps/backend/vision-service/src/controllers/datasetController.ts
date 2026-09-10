import { Request, Response } from 'express';
import * as datasetService from '../services/datasetService';
import { getLabelingStats as getLabelingStatsService } from '../services/datasetImageService';
import type { GetDatasetsQuery } from '../validation/datasetSchemas';

// Get all datasets
export const getDatasets = async (req: Request, res: Response): Promise<void> => {
  const data = await datasetService.getDatasets(req.query as unknown as GetDatasetsQuery);

  res.json({
    success: true,
    data
  });
};

// Get dataset by ID
export const getDatasetById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const dataset = await datasetService.getDatasetById(id);

  res.json({
    success: true,
    data: dataset
  });
};

// Get dataset by UUID
export const getDatasetByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params as { uuid: string };
  const dataset = await datasetService.getDatasetByUuid(uuid);

  res.json({
    success: true,
    data: dataset
  });
};

// Create dataset
export const createDataset = async (req: Request, res: Response): Promise<void> => {
  const savedDataset = await datasetService.createDataset(req.body, req.user?.id);

  res.status(201).json({
    success: true,
    message: 'Dataset created successfully',
    data: savedDataset
  });
};

// Get labeling statistics for all images
export const getLabelingStats = async (req: Request, res: Response): Promise<void> => {
  const result = await getLabelingStatsService();

  res.json({
    success: true,
    data: result
  });
};

// Download dataset zip file
export const downloadDataset = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params as { uuid: string };
  const data = await datasetService.getDatasetDownload(uuid);

  res.json({
    success: true,
    data
  });
};
