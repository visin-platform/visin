import { claimUpload, reserveUpload } from './uploadReservationService';
import { assertEpochWrite } from './writeAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter } from 'mongoose';
import { ConflictError, ForbiddenError, NotFoundError, logger } from '@visin/backend-core';
import EpochVisualization, { IEpochVisualization } from '../models/EpochVisualization';
import Epoch from '../models/Epoch';
import Training from '../models/Training';
import { getSignedUrl, getUploadSignedUrl, type SignedUrlData } from './fileServiceClient';
import { checkProjectAccess, getVisibleTrainingIds, resolveProject } from './projectAccessService';
import type { GetVisualizationsByTrainingQuery } from '../validation/visualizationSchemas';

import { checkEpochAccess } from './epochAccessService';

function withSignedUrl(viz: IEpochVisualization, signedUrlData: SignedUrlData | null) {
  return {
    ...viz.toObject(),
    signedUrl: signedUrlData?.signedUrl,
    urlExpiresAt: signedUrlData?.expiresAt
  };
}

interface UploadUrlData {
  epoch_uuid: string;
  filename: string;
  type: string;
  mimetype: string;
}

export const getVisualizationUploadUrl = async (
  data: UploadUrlData,
  userId: string | undefined,
  reqProjectId: string | undefined
) => {
  const { epoch_uuid, filename, type, mimetype } = data;

  const epoch = await Epoch.findOne({ epoch_uuid });
  if (!epoch) {
    throw new NotFoundError('Epoch not found');
  }

  await assertEpochWrite(epoch_uuid, userId, reqProjectId);
  if (!(await checkEpochAccess(epoch_uuid, userId, reqProjectId))) {
    throw new ForbiddenError();
  }

  const visualization_uuid = uuidv4();
  const extension =
    filename
      .split('.')
      .pop()
      ?.replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 12) || 'bin';
  const folder = type.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'image';
  const fileId = `visualizations/${epoch._id}/${folder}/${visualization_uuid}.${extension}`;

  await reserveUpload(fileId, 'visualization', epoch_uuid, mimetype, userId, visualization_uuid);
  const uploadUrl = await getUploadSignedUrl(fileId, mimetype, 15);

  logger.info('Visualization upload URL generated', {
    visualization_uuid,
    epoch_uuid,
    type,
    filename
  });

  // Training pipelines echo the returned file id back on the follow-up create call.
  return {
    uploadUrl,
    visualization_uuid,
    fileId,
    epoch_uuid,
    expiresInMinutes: 15
  };
};

interface CreateVisualizationData {
  epoch_uuid: string;
  visualization_uuid: string;
  filename: string;
  type: string;
  fileId: string;
  mimetype: string;
  size: number;
  metadata?: unknown;
}

export const createVisualization = async (
  data: CreateVisualizationData,
  userId: string | undefined,
  reqProjectId: string | undefined
): Promise<IEpochVisualization> => {
  const { epoch_uuid, visualization_uuid, filename, type, fileId, mimetype, size, metadata } = data;

  const epoch = await Epoch.findOne({ epoch_uuid });
  if (!epoch) {
    throw new NotFoundError('Epoch not found');
  }

  await assertEpochWrite(epoch_uuid, userId, reqProjectId);
  if (!(await checkEpochAccess(epoch_uuid, userId, reqProjectId))) {
    throw new ForbiddenError();
  }

  const existingVisualization = await EpochVisualization.findOne({ visualization_uuid });
  if (existingVisualization) {
    throw new ConflictError('Visualization with this UUID already exists');
  }

  await claimUpload(fileId, 'visualization', epoch_uuid, 'visualization', userId, visualization_uuid, size, mimetype);
  const visualization = new EpochVisualization({
    epoch_uuid,
    visualization_uuid,
    filename,
    type,
    fileId,
    uploadedAt: new Date(),
    metadata: {
      ...(metadata as object),
      mimetype,
      size
    }
  });

  await visualization.save();

  logger.info('Visualization created successfully', {
    visualization_uuid,
    epoch_uuid,
    type,
    filename
  });

  return visualization;
};

export const getVisualizationByUuid = async (visualization_uuid: string, userId: string | undefined) => {
  const visualization = await EpochVisualization.findOne({ visualization_uuid });

  if (!visualization) {
    throw new NotFoundError('Visualization not found');
  }

  if (!(await checkEpochAccess(visualization.epoch_uuid, userId))) {
    throw new ForbiddenError();
  }

  const signedUrlData = await getSignedUrl(visualization.fileId, 60);

  return withSignedUrl(visualization, signedUrlData);
};

export const deleteVisualization = async (
  visualization_uuid: string,
  userId: string | undefined,
  reqProjectId: string | undefined
): Promise<void> => {
  const visualization = await EpochVisualization.findOne({ visualization_uuid });

  if (!visualization) {
    throw new NotFoundError('Visualization not found');
  }

  await assertEpochWrite(visualization.epoch_uuid, userId, reqProjectId);
  if (!(await checkEpochAccess(visualization.epoch_uuid, userId, reqProjectId))) {
    throw new ForbiddenError();
  }

  // Note: we deliberately leave the stored file in place and only delete the
  // database record
  await EpochVisualization.deleteOne({ visualization_uuid });

  logger.info('Visualization deleted', { visualization_uuid });
};

export const getVisualizationsByEpoch = async (
  epoch_uuid: string,
  type: string | undefined,
  userId: string | undefined
) => {
  if (!(await checkEpochAccess(epoch_uuid, userId))) {
    throw new ForbiddenError();
  }

  const query: QueryFilter<IEpochVisualization> = { epoch_uuid };
  if (type) {
    query.type = type;
  }

  const visualizations = await EpochVisualization.find(query).sort({ uploadedAt: -1 });
  const visualizationsWithUrls = await Promise.all(
    visualizations.map(async (viz) => withSignedUrl(viz, await getSignedUrl(viz.fileId, 60)))
  );

  return {
    visualizations: visualizationsWithUrls,
    total: visualizations.length
  };
};

interface VisualizationsByTrainingUuidResult {
  visualizations: unknown[];
  total: number;
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface VisualizationsByProjectResult {
  trainings: { training_uuid: string; training_name: string; visualizations: unknown[] }[];
  total: number;
}

export type VisualizationsByTrainingResult = VisualizationsByTrainingUuidResult | VisualizationsByProjectResult;

export const getVisualizationsByTraining = async (
  training_uuid: string | undefined,
  filters: GetVisualizationsByTrainingQuery,
  userId: string | undefined
): Promise<VisualizationsByTrainingResult> => {
  const { type, limit, page, projectId, includeUrls } = filters;
  const shouldIncludeUrls = includeUrls === 'true';

  // If specific training_uuid is provided, return flat list for that training
  if (training_uuid && training_uuid.trim() !== '') {
    const parentTraining = await Training.findOne({ uuid: training_uuid, deletedAt: null });
    if (!parentTraining) throw new NotFoundError('Training not found');
    if (!(await checkProjectAccess(userId, parentTraining.projectId))) {
      throw new ForbiddenError();
    }

    const epochs = await Epoch.find({ trainingId: parentTraining._id.toString(), deletedAt: null }).select(
      'epoch_uuid epoch'
    );
    const epochUuids = epochs.map((e) => e.epoch_uuid);

    if (epochUuids.length === 0) {
      return { visualizations: [], total: 0, pagination: { page, limit, total: 0, pages: 0 } };
    }

    const query: QueryFilter<IEpochVisualization> = { epoch_uuid: { $in: epochUuids } };
    if (type) {
      query.type = type;
    }

    const skip = (page - 1) * limit;
    const total = await EpochVisualization.countDocuments(query);
    const visualizations = await EpochVisualization.find(query).sort({ uploadedAt: -1 }).skip(skip).limit(limit);

    const visualizationsWithUrls = await Promise.all(
      visualizations.map(async (viz) => {
        const epoch = epochs.find((e) => e.epoch_uuid === viz.epoch_uuid);
        const result: Record<string, unknown> = { ...viz.toObject(), epoch: epoch?.epoch };
        if (shouldIncludeUrls) {
          const signedUrlData = await getSignedUrl(viz.fileId, 60);
          result.signedUrl = signedUrlData?.signedUrl;
          result.urlExpiresAt = signedUrlData?.expiresAt;
        }
        return result;
      })
    );

    return {
      visualizations: visualizationsWithUrls,
      total,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  }

  // If no training_uuid but projectId provided, group by training
  if (projectId) {
    if (!(await checkProjectAccess(userId, projectId))) {
      throw new ForbiddenError();
    }
    // The filter may name a slug; trainings store the canonical id.
    const project = await resolveProject(projectId);
    if (!project) throw new NotFoundError('Project not found');

    const trainings = await Training.find({ projectId: project._id.toString(), deletedAt: null })
      .select('uuid name')
      .sort({ createdAt: -1 });

    if (trainings.length === 0) {
      return { trainings: [], total: 0 };
    }

    const trainingsData = await Promise.all(
      trainings.map(async (training) => {
        const epochs = await Epoch.find({ trainingId: training._id.toString(), deletedAt: null }).select(
          'epoch_uuid epoch'
        );
        const epochUuids = epochs.map((e) => e.epoch_uuid);

        if (epochUuids.length === 0) {
          return { training_uuid: training.uuid, training_name: training.name, visualizations: [] };
        }

        const query: QueryFilter<IEpochVisualization> = { epoch_uuid: { $in: epochUuids } };
        if (type) {
          query.type = type;
        }

        const visualizations = await EpochVisualization.find(query).sort({ uploadedAt: -1 });

        const visualizationsWithUrls = await Promise.all(
          visualizations.map(async (viz) => {
            const epoch = epochs.find((e) => e.epoch_uuid === viz.epoch_uuid);
            const result: Record<string, unknown> = { ...viz.toObject(), epoch: epoch?.epoch };
            if (shouldIncludeUrls) {
              const signedUrlData = await getSignedUrl(viz.fileId, 60);
              result.signedUrl = signedUrlData?.signedUrl;
              result.urlExpiresAt = signedUrlData?.expiresAt;
            }
            return result;
          })
        );

        return { training_uuid: training.uuid, training_name: training.name, visualizations: visualizationsWithUrls };
      })
    );

    return {
      trainings: trainingsData,
      total: trainingsData.reduce((sum, t) => sum + t.visualizations.length, 0)
    };
  }

  // Fallback: get all visualizations without grouping (shouldn't happen with current frontend)
  const query: QueryFilter<IEpochVisualization> = {};
  if (type) {
    query.type = type;
  }

  // No training_uuid/projectId filter given: scope to epochs whose training
  // is visible to the caller — otherwise this returns every project's
  // visualization images regardless of privacy.
  const visibleTrainingIds = await getVisibleTrainingIds(userId);
  const visibleEpochs = await Epoch.find({ trainingId: { $in: visibleTrainingIds }, deletedAt: null }).select(
    'epoch_uuid'
  );
  query.epoch_uuid = { $in: visibleEpochs.map((e) => e.epoch_uuid) };

  const skip = (page - 1) * limit;
  const total = await EpochVisualization.countDocuments(query);
  const visualizations = await EpochVisualization.find(query).sort({ uploadedAt: -1 }).skip(skip).limit(limit);

  const uniqueEpochUuids = [...new Set(visualizations.map((v) => v.epoch_uuid))];
  const allEpochs = await Epoch.find({ epoch_uuid: { $in: uniqueEpochUuids }, deletedAt: null }).select(
    'epoch_uuid epoch training_uuid'
  );

  const visualizationsWithUrls = await Promise.all(
    visualizations.map(async (viz) => {
      const epoch = allEpochs.find((e) => e.epoch_uuid === viz.epoch_uuid);
      const result: Record<string, unknown> = {
        ...viz.toObject(),
        epoch: epoch?.epoch,
        training_uuid: epoch?.training_uuid
      };
      if (shouldIncludeUrls) {
        const signedUrlData = await getSignedUrl(viz.fileId, 60);
        result.signedUrl = signedUrlData?.signedUrl;
        result.urlExpiresAt = signedUrlData?.expiresAt;
      }
      return result;
    })
  );

  return {
    visualizations: visualizationsWithUrls,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
};

export const getVisualizationTypes = async (
  training_uuid: string | undefined,
  epoch_uuid: string | undefined,
  userId: string | undefined
): Promise<string[]> => {
  const query: QueryFilter<IEpochVisualization> = {};

  if (epoch_uuid) {
    if (!(await checkEpochAccess(epoch_uuid, userId))) {
      throw new ForbiddenError();
    }
    query.epoch_uuid = epoch_uuid;
  } else if (training_uuid) {
    const parentTraining = await Training.findOne({ uuid: training_uuid, deletedAt: null });
    if (!parentTraining) throw new NotFoundError('Training not found');
    if (!(await checkProjectAccess(userId, parentTraining.projectId))) {
      throw new ForbiddenError();
    }
    const epochs = await Epoch.find({ trainingId: parentTraining._id.toString(), deletedAt: null }).select(
      'epoch_uuid'
    );
    const epochUuids = epochs.map((e) => e.epoch_uuid);
    query.epoch_uuid = { $in: epochUuids };
  }

  if (!epoch_uuid && !training_uuid) {
    const ids = await getVisibleTrainingIds(userId);
    const epochs = await Epoch.find({ trainingId: { $in: ids }, deletedAt: null }).select('epoch_uuid');
    query.$and = [{ epoch_uuid: { $in: epochs.map((row) => row.epoch_uuid) } }];
  }
  const types = await EpochVisualization.distinct('type', query);
  return types.sort();
};
