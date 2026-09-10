import { Request, Response } from 'express';
import * as configService from '../services/configService';
import type { GetAllConfigsQuery } from '../validation/configSchemas';

// Get all configs
export const getAllConfigs = async (req: Request, res: Response): Promise<void> => {
  const data = await configService.getAllConfigs(req.query as unknown as GetAllConfigsQuery);

  res.json({
    success: true,
    data
  });
};

// Get configs for a training (configs associated with training through selection)
export const getConfigsByTraining = async (req: Request, res: Response): Promise<void> => {
  const { id, trainingId } = req.params as { id?: string; trainingId?: string };
  const data = await configService.getConfigsByTraining(trainingId || id || '', req.user?.id);

  res.json({
    success: true,
    data
  });
};

// Get config by ID
export const getConfigById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const config = await configService.getConfigById(id);

  res.json({
    success: true,
    data: config
  });
};

// Get config by UUID
export const getConfigByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params as { uuid: string };
  const config = await configService.getConfigByUuid(uuid);

  res.json({
    success: true,
    data: config
  });
};

// Create config
export const createConfig = async (req: Request, res: Response): Promise<void> => {
  const savedConfig = await configService.createConfig(req.body, req.user?.id);

  res.status(201).json({
    success: true,
    message: 'Config created successfully',
    data: savedConfig
  });
};

// Create config from JSON file
export const createConfigFromJson = async (req: Request, res: Response): Promise<void> => {
  const savedConfig = await configService.createConfig(req.body, req.user?.id);

  res.status(201).json({
    success: true,
    message: 'Config created successfully',
    data: savedConfig
  });
};
