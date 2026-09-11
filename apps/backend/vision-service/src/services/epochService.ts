import { assertResourceWrite } from './writeAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Epoch from '../models/Epoch';
import Training, { ITraining } from '../models/Training';
import { checkProjectAccess, isWithinTokenScope } from './projectAccessService';
import type { z } from '@visin/backend-core';
import type { GetEpochsByTrainingQuery, createEpochsBatchBodySchema } from '../validation/epochSchemas';

type CreateEpochsBatchData = z.infer<typeof createEpochsBatchBodySchema>;

interface CreateEpochData {
  trainingId: string;
  training_uuid: string;
  epoch_uuid?: string;
  epoch: number;
  timestamp?: Date;
  results: unknown;
  learning_rate?: number;
  epoch_time?: number;
  system_info?: unknown;
  metadata?: unknown;
}

interface CreateEpochFromJsonData {
  trainingId?: string;
  training_uuid?: string;
  epoch_uuid?: string;
  epoch: number;
  timestamp?: Date;
  results: unknown;
  learning_rate?: number;
  epoch_time?: number;
  metadata?: unknown;
}

interface UpdateEpochData {
  timestamp?: Date;
  results?: Record<string, unknown>;
  learning_rate?: number;
  epoch_time?: number;
  metadata?: Record<string, unknown>;
}

const assertTrainingAccess = async (
  training: ITraining | null | undefined,
  userId: string | undefined,
  tokenProjectId?: string,
  tokenScopeMessage = false
) => {
  // Only an existing live training may use the public standalone policy.
  if (!training || training.deletedAt || !(await checkProjectAccess(userId, training.projectId))) {
    throw new ForbiddenError();
  }

  if (!isWithinTokenScope(tokenProjectId, training.projectId)) {
    throw new ForbiddenError(tokenScopeMessage ? 'Training does not belong to the token\'s project' : undefined);
  }
};

const getTrainingByIdOrThrow = async (trainingId: string, message = 'Training not found') => {
  const training = await Training.findById(trainingId);
  if (!training) {
    throw new NotFoundError(message);
  }
  return training;
};

const getEpochByIdOrThrow = async (id: string) => {
  const epoch = await Epoch.findById(id);

  if (!epoch || epoch.deletedAt) {
    throw new NotFoundError('Epoch not found');
  }

  return epoch;
};

export const getEpochsByTraining = async (
  trainingId: string,
  { page, limit, sortBy, order }: GetEpochsByTrainingQuery,
  userId: string | undefined
) => {
  const training = await getTrainingByIdOrThrow(trainingId);
  await assertTrainingAccess(training, userId);

  const filter = { trainingId, deletedAt: null };
  let query = Epoch.find(filter).sort({ [sortBy]: order });

  if (page && limit) {
    const numericPage = Number(page);
    const numericLimit = Number(limit);
    const skip = (numericPage - 1) * numericLimit;
    query = query.skip(skip).limit(numericLimit);

    const [epochs, total] = await Promise.all([
      query,
      Epoch.countDocuments(filter)
    ]);

    return {
      epochs,
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total,
        pages: Math.ceil(total / numericLimit)
      }
    };
  }

  const epochs = await query;
  return {
    epochs,
    total: epochs.length
  };
};

export const getEpochById = async (id: string, userId: string | undefined) => {
  const epoch = await getEpochByIdOrThrow(id);
  const training = await Training.findById(epoch.trainingId);
  await assertTrainingAccess(training, userId);
  return epoch;
};

export const getEpochByUuid = async (uuid: string, userId: string | undefined) => {
  const epoch = await Epoch.findOne({ epoch_uuid: uuid });

  if (!epoch || epoch.deletedAt) {
    throw new NotFoundError('Epoch not found');
  }

  const training = await Training.findById(epoch.trainingId);
  await assertTrainingAccess(training, userId);
  return epoch;
};

export const createEpoch = async (
  data: CreateEpochData,
  userId: string | undefined,
  tokenProjectId?: string
) => {
  const training = await getTrainingByIdOrThrow(data.trainingId);
  await assertTrainingAccess(training, userId, tokenProjectId, true);
  await assertResourceWrite(training, userId);

  const epochData = new Epoch({
    trainingId: data.trainingId,
    training_uuid: training.uuid,
    epoch_uuid: data.epoch_uuid || uuidv4(),
    epoch: data.epoch,
    timestamp: data.timestamp || new Date(),
    results: data.results,
    learning_rate: data.learning_rate,
    epoch_time: data.epoch_time,
    system_info: data.system_info,
    metadata: data.metadata
  });

  const savedEpoch = await epochData.save();
  await Training.findByIdAndUpdate(data.trainingId, { updatedAt: new Date() });

  return savedEpoch;
};

export const updateEpoch = async (
  id: string,
  updateData: UpdateEpochData,
  userId: string | undefined,
  tokenProjectId?: string
) => {
  const epoch = await getEpochByIdOrThrow(id);
  const training = await Training.findById(epoch.trainingId);
  await assertTrainingAccess(training, userId, tokenProjectId, true);
  await assertResourceWrite(training, userId);

  if (updateData.timestamp !== undefined) epoch.timestamp = updateData.timestamp;
  if (updateData.results !== undefined) epoch.results = updateData.results;
  if (updateData.learning_rate !== undefined) epoch.learning_rate = updateData.learning_rate;
  if (updateData.epoch_time !== undefined) epoch.epoch_time = updateData.epoch_time;
  if (updateData.metadata !== undefined) epoch.metadata = updateData.metadata;

  return epoch.save();
};

export const createEpochFromJson = async (
  data: CreateEpochFromJsonData,
  userId: string | undefined,
  tokenProjectId?: string
) => {
  let training: ITraining;
  let trainId: string;
  let trainUuid: string;

  if (data.trainingId) {
    training = await getTrainingByIdOrThrow(data.trainingId, `Training not found with id: ${data.trainingId}`);
    trainId = data.trainingId;
    trainUuid = training.uuid;
  } else if (data.training_uuid) {
    const foundTraining = await Training.findOne({ uuid: data.training_uuid });
    if (!foundTraining) {
      throw new NotFoundError(`Training not found with uuid: ${data.training_uuid}`);
    }
    training = foundTraining;
    trainId = training._id.toString();
    trainUuid = data.training_uuid;
  } else {
    throw new BadRequestError('Either trainingId or training_uuid is required');
  }

  await assertTrainingAccess(training, userId, tokenProjectId, true);
  await assertResourceWrite(training, userId);

  if (data.epoch_uuid) {
    const existingEpoch = await Epoch.findOne({ epoch_uuid: data.epoch_uuid });
    if (existingEpoch) {
      throw new ConflictError(`Epoch with uuid ${data.epoch_uuid} already exists`);
    }
  }

  const epochData = new Epoch({
    trainingId: trainId,
    training_uuid: trainUuid,
    epoch_uuid: data.epoch_uuid || uuidv4(),
    epoch: data.epoch,
    timestamp: data.timestamp || new Date(),
    results: data.results,
    learning_rate: data.learning_rate,
    epoch_time: data.epoch_time,
    metadata: data.metadata
  });

  const savedEpoch = await epochData.save();
  await Training.findByIdAndUpdate(trainId, { updatedAt: new Date() });

  return savedEpoch;
};

export const createEpochsBatch = async (
  { epochs }: CreateEpochsBatchData,
  userId: string | undefined,
  tokenProjectId?: string
) => {
  const preparedEpochs = epochs.map((epoch) => ({
    ...epoch,
    epoch_uuid: epoch.epoch_uuid || uuidv4(),
    timestamp: epoch.timestamp || new Date()
  }));

  const uniqueTrainingIds = [...new Set(preparedEpochs.map((epoch) => epoch.trainingId))];
  const trainings = await Training.find({ _id: { $in: uniqueTrainingIds } });
  const trainingById = new Map(trainings.map((training) => [training._id.toString(), training]));

  for (const trainingId of uniqueTrainingIds) {
    const training = trainingById.get(trainingId);
    if (!training || !(await checkProjectAccess(userId, training.projectId)) || !isWithinTokenScope(tokenProjectId, training.projectId)) {
      throw new ForbiddenError();
    }
    await assertResourceWrite(training, userId);
  }

  const savedEpochs = await Epoch.insertMany(preparedEpochs.map(epoch => ({
    ...epoch, training_uuid: trainingById.get(epoch.trainingId)!.uuid
  })));

  await Training.updateMany(
    { _id: { $in: uniqueTrainingIds } },
    { updatedAt: new Date() }
  );

  return savedEpochs;
};
