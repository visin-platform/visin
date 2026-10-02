import { assertResourceWrite, requireActor } from './writeAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { type QueryFilter, isValidObjectId } from 'mongoose';
import { BadRequestError, NotFoundError } from '@visin/backend-core';
import { trainingService } from './trainingService';
import { checkProjectAccess, getVisibleProjectIds, resolveProject } from './projectAccessService';
import { tokenProjectId } from '../middleware/projectTokenContext';
import Config, { type IConfig } from '../models/Config';
import type { GetAllConfigsQuery } from '../validation/configSchemas';
import { MAX_PAGE_SIZE } from '../validation/common';

interface ConfigData {
  config_uuid?: string;
  summary: string;
  config_data: unknown;
  config_name?: string;
  metadata?: unknown;
  projectId?: string;
}

/**
 * A config belongs to a project and is seen by whoever can read that project.
 * One from before configs had a project, which no migration could place, is
 * seen by its creator alone.
 */
async function visibleConfigFilter(userId: string | undefined): Promise<QueryFilter<IConfig>> {
  const projectIds = await getVisibleProjectIds(userId);
  return {
    $or: [
      { projectId: { $in: projectIds } },
      ...(userId && !tokenProjectId() ? [{ projectId: null, ownerId: userId }] : [])
    ]
  };
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
    const config = await Config.findOne({ $and: [{ _id: training.configId }, await visibleConfigFilter(userId)] });
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

export const createConfig = async ({ summary, config_data, config_name, metadata, projectId, config_uuid }: ConfigData, userId?: string) => {
  const ownerId = requireActor(userId);
  const reference = tokenProjectId() || projectId;
  if (!reference) throw new BadRequestError("A config needs a project: pass projectId, the project's id or slug");
  const project = await resolveProject(reference);
  if (!project || !(await checkProjectAccess(userId, reference))) {
    throw new NotFoundError(`Project "${reference}" not found. Create it at /projects?new=1 in Visin, or check the name.`);
  }
  await assertResourceWrite({ projectId: project._id.toString(), ownerId }, userId);
  const configData = new Config({
    ownerId,
    projectId: project._id.toString(),
    config_uuid: config_uuid || uuidv4(),
    summary,
    config_data,
    config_name,
    metadata
  });

  return configData.save();
};
