import { Request, Response } from 'express';
import * as epochService from '../services/epochService';
import type { z } from '@visin/backend-core';
import type { GetEpochsByTrainingQuery, createEpochsBatchBodySchema } from '../validation/epochSchemas';

type CreateEpochsBatchData = z.infer<typeof createEpochsBatchBodySchema>;

// Get epochs for a training
export const getEpochsByTraining = async (req: Request, res: Response): Promise<void> => {
  const { trainingId } = req.params as { trainingId: string };
  const data = await epochService.getEpochsByTraining(
    trainingId,
    req.query as unknown as GetEpochsByTrainingQuery,
    req.user?.id
  );

  res.json({
    success: true,
    data
  });
};

// Get epoch by ID
export const getEpochById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const epoch = await epochService.getEpochById(id, req.user?.id);

  res.json({
    success: true,
    data: epoch
  });
};

// Get epoch by UUID
export const getEpochByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params as { uuid: string };
  const epoch = await epochService.getEpochByUuid(uuid, req.user?.id);

  res.json({
    success: true,
    data: epoch
  });
};

// Create epoch
export const createEpoch = async (req: Request, res: Response): Promise<void> => {
  const savedEpoch = await epochService.createEpoch(req.body, req.user?.id, req.projectId);

  res.status(201).json({
    success: true,
    message: 'Epoch created successfully',
    data: savedEpoch
  });
};

// Update epoch
export const updateEpoch = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const updatedEpoch = await epochService.updateEpoch(id, req.body, req.user?.id, req.projectId);

  res.json({
    success: true,
    message: 'Epoch updated successfully',
    data: updatedEpoch
  });
};

// Create epoch from JSON file (accepts training_uuid and looks up trainingId, or accepts trainingId directly)
export const createEpochFromJson = async (req: Request, res: Response): Promise<void> => {
  const savedEpoch = await epochService.createEpochFromJson(req.body, req.user?.id, req.projectId);

  res.status(201).json({
    success: true,
    message: 'Epoch created successfully',
    data: savedEpoch
  });
};

// Batch create epochs
export const createEpochsBatch = async (req: Request, res: Response): Promise<void> => {
  const savedEpochs = await epochService.createEpochsBatch(
    req.body as CreateEpochsBatchData,
    req.user?.id,
    req.projectId
  );

  res.status(201).json({
    success: true,
    message: `${savedEpochs.length} epochs created successfully`,
    data: savedEpochs
  });
};
