import { requireActor } from './writeAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { isValidObjectId, type QueryFilter } from 'mongoose';
import { NotFoundError } from '@visin/backend-core';
import { trainingService } from './trainingService';
import { getVisibleProjectIds } from './projectAccessService';
import Config, { type IConfig } from '../models/Config';
import Training from '../models/Training';
import type { GetAllConfigsQuery } from '../validation/configSchemas';
import { MAX_PAGE_SIZE } from '../validation/common';

interface ConfigData {
  summary: string;
  config_data: unknown;
  config_name?: string;
  metadata?: unknown;
}

/**
 * Configs are a shared library, but a config says a lot about the run it came
 * from. One is hidden when every training using it sits in a project the
 * caller cannot see — a deleted training still counts, so deleting a private
 * run does not publish its config. The config's owner always sees it.
 */
async function visibleConfigFilter(userId: string | undefined): Promise<QueryFilter<IConfig>> {
  const projectIds = await getVisibleProjectIds(userId);
  const [hiddenRefs, visibleRefs] = await Promise.all([
    Training.distinct('configId', { configId: { $nin: [null, ''] }, projectId: { $nin: [...projectIds, null] } }),
    Training.distinct('configId', {
      configId: { $nin: [null, ''] },
      deletedAt: null,
      $or: [{ projectId: { $in: projectIds } }, { projectId: null }]
    })
  ]);
  const shown = new Set(visibleRefs.map(String));
  const hidden = hiddenRefs.map(String).filter(id => !shown.has(id) && isValidObjectId(id));
  if (hidden.length === 0) return {};
  return { $or: [...(userId ? [{ ownerId: userId }] : []), { _id: { $nin: hidden } }] };
}

export const getAllConfigs = async ({ page, limit, sortBy, order }: GetAllConfigsQuery, userId?: string) => {
  const filter = await visibleConfigFilter(userId);
  let query = Config.find(filter).sort({ [sortBy]: order });

  if (page && limit) {
    const numericPage = Number(page);
    const numericLimit = Number(limit);
    const skip = (numericPage - 1) * numericLimit;
    query = query.skip(skip).limit(numericLimit);

    const [configs, total] = await Promise.all([
      query,
      Config.countDocuments(filter)
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

  const configs = await query.limit(MAX_PAGE_SIZE);
  return {
    configs,
    total: configs.length
  };
};

export const getConfigsByTraining = async (trainingId: string, userId?: string) => {
  const training = await trainingService.getTrainingById(trainingId, userId);

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

export const getConfigById = async (id: string, userId?: string) => {
  const config = isValidObjectId(id)
    ? await Config.findOne({ $and: [{ _id: id }, await visibleConfigFilter(userId)] })
    : null;

  if (!config) {
    throw new NotFoundError('Config not found');
  }

  return config;
};

export const getConfigByUuid = async (uuid: string, userId?: string) => {
  const config = await Config.findOne({ $and: [{ config_uuid: uuid }, await visibleConfigFilter(userId)] });

  if (!config) {
    throw new NotFoundError('Config not found');
  }

  return config;
};

export const createConfig = async ({ summary, config_data, config_name, metadata }: ConfigData, userId?: string) => {
  const configData = new Config({
    ownerId: requireActor(userId),
    config_uuid: uuidv4(),
    summary,
    config_data,
    config_name,
    metadata
  });

  return configData.save();
};
