import { Request, Response } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import { NotFoundError } from '@visin/backend-core';
import Config from '../models/Config';
import Training from '../models/Training';
import type { GetAllConfigsQuery } from '../validation/configSchemas';

// Get all configs
export const getAllConfigs = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, order } = req.query as unknown as GetAllConfigsQuery;

  let query = Config.find().sort({ [sortBy]: order });

  // If pagination is provided
  if (page && limit) {
    const skip = (Number(page) - 1) * Number(limit);
    query = query.skip(skip).limit(Number(limit));

    const [configs, total] = await Promise.all([
      query,
      Config.countDocuments()
    ]);

    res.json({
      success: true,
      data: {
        configs,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } else {
    // Return all configs without pagination
    const configs = await query;

    res.json({
      success: true,
      data: {
        configs,
        total: configs.length
      }
    });
  }
};

// Get configs for a training (configs associated with training through selection)
export const getConfigsByTraining = async (req: Request, res: Response): Promise<void> => {
  const { trainingId } = req.params;

  // Check if training exists
  const training = await Training.findById(trainingId);
  if (!training) {
    throw new NotFoundError('Training not found');
  }

  // If training has a configId, return that config
  if ((training as any).configId) {
    const config = await Config.findById((training as any).configId);
    if (config) {
      res.json({
        success: true,
        data: {
          configs: [config],
          total: 1
        }
      });
      return;
    }
  }

  res.json({
    success: true,
    data: {
      configs: [],
      total: 0
    }
  });
};

// Get config by ID
export const getConfigById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const config = await Config.findById(id);

  if (!config) {
    throw new NotFoundError('Config not found');
  }

  res.json({
    success: true,
    data: config
  });
};

// Get config by UUID
export const getConfigByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  const config = await Config.findOne({ config_uuid: uuid });

  if (!config) {
    throw new NotFoundError('Config not found');
  }

  res.json({
    success: true,
    data: config
  });
};

// Create config
export const createConfig = async (req: Request, res: Response): Promise<void> => {
  const {
    summary,
    config_data,
    config_name,
    metadata
  } = req.body;

  const config_uuid = uuidv4();

  const configData = new Config({
    config_uuid,
    summary,
    config_data,
    config_name,
    metadata
  });

  const savedConfig = await configData.save();

  res.status(201).json({
    success: true,
    message: 'Config created successfully',
    data: savedConfig
  });
};

// Create config from JSON file
export const createConfigFromJson = async (req: Request, res: Response): Promise<void> => {
  const {
    config_data,
    summary,
    config_name,
    metadata
  } = req.body;

  const config_uuid = uuidv4();

  const configData = new Config({
    config_uuid,
    summary,
    config_data,
    config_name,
    metadata
  });

  const savedConfig = await configData.save();

  res.status(201).json({
    success: true,
    message: 'Config created successfully',
    data: savedConfig
  });
};
