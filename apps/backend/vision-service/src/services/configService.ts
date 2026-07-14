import { randomUUID as uuidv4 } from 'crypto';
import { NotFoundError } from '@visin/backend-core';
import Config from '../models/Config';
import Training from '../models/Training';
import type { GetAllConfigsQuery } from '../validation/configSchemas';

interface ConfigData {
  summary: string;
  config_data: unknown;
  config_name?: string;
  metadata?: unknown;
}

export const getAllConfigs = async ({ page, limit, sortBy, order }: GetAllConfigsQuery) => {
  let query = Config.find().sort({ [sortBy]: order });

  if (page && limit) {
    const numericPage = Number(page);
    const numericLimit = Number(limit);
    const skip = (numericPage - 1) * numericLimit;
    query = query.skip(skip).limit(numericLimit);

    const [configs, total] = await Promise.all([
      query,
      Config.countDocuments()
    ]);

    return {
      configs,
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total,
        pages: Math.ceil(total / numericLimit)
      }
    };
  }

  const configs = await query;
  return {
    configs,
    total: configs.length
  };
};

export const getConfigsByTraining = async (trainingId: string) => {
  const training = await Training.findById(trainingId);
  if (!training) {
    throw new NotFoundError('Training not found');
  }

  if (training.configId) {
    const config = await Config.findById(training.configId);
    if (config) {
      return {
        configs: [config],
        total: 1
      };
    }
  }

  return {
    configs: [],
    total: 0
  };
};

export const getConfigById = async (id: string) => {
  const config = await Config.findById(id);

  if (!config) {
    throw new NotFoundError('Config not found');
  }

  return config;
};

export const getConfigByUuid = async (uuid: string) => {
  const config = await Config.findOne({ config_uuid: uuid });

  if (!config) {
    throw new NotFoundError('Config not found');
  }

  return config;
};

export const createConfig = async ({ summary, config_data, config_name, metadata }: ConfigData) => {
  const configData = new Config({
    config_uuid: uuidv4(),
    summary,
    config_data,
    config_name,
    metadata
  });

  return configData.save();
};
