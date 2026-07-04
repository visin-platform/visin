import { Request, Response } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Epoch from '../models/Epoch';
import Training from '../models/Training';
import { checkProjectAccess, isWithinTokenScope } from '../services/projectAccessService';
import type { GetEpochsByTrainingQuery } from '../validation/epochSchemas';

// Get epochs for a training
export const getEpochsByTraining = async (req: Request, res: Response): Promise<void> => {
  const { trainingId } = req.params;
  const { page, limit, sortBy, order } = req.query as unknown as GetEpochsByTrainingQuery;

  // Check if training exists
  const training = await Training.findById(trainingId);
  if (!training) {
    throw new NotFoundError('Training not found');
  }

  if (!(await checkProjectAccess(req.user?.id, training.projectId))) {
    throw new ForbiddenError();
  }

  let query = Epoch.find({ trainingId }).sort({ [sortBy]: order });

  // If pagination is provided
  if (page && limit) {
    const skip = (Number(page) - 1) * Number(limit);
    query = query.skip(skip).limit(Number(limit));

    const [epochs, total] = await Promise.all([
      query,
      Epoch.countDocuments({ trainingId })
    ]);

    res.json({
      success: true,
      data: {
        epochs,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } else {
    // Return all epochs without pagination
    const epochs = await query;

    res.json({
      success: true,
      data: {
        epochs,
        total: epochs.length
      }
    });
  }
};

// Get epoch by ID
export const getEpochById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const epoch = await Epoch.findById(id);

  if (!epoch) {
    throw new NotFoundError('Epoch not found');
  }

  const training = await Training.findById(epoch.trainingId);
  if (!(await checkProjectAccess(req.user?.id, training?.projectId))) {
    throw new ForbiddenError();
  }

  res.json({
    success: true,
    data: epoch
  });
};

// Get epoch by UUID
export const getEpochByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  const epoch = await Epoch.findOne({ epoch_uuid: uuid });

  if (!epoch) {
    throw new NotFoundError('Epoch not found');
  }

  const training = await Training.findById(epoch.trainingId);
  if (!(await checkProjectAccess(req.user?.id, training?.projectId))) {
    throw new ForbiddenError();
  }

  res.json({
    success: true,
    data: epoch
  });
};

// Create epoch
export const createEpoch = async (req: Request, res: Response): Promise<void> => {
  const {
    trainingId,
    training_uuid,
    epoch,
    timestamp,
    results,
    learning_rate,
    epoch_time,
    system_info,
    metadata
  } = req.body;

  // Check if training exists
  const training = await Training.findById(trainingId);
  if (!training) {
    throw new NotFoundError('Training not found');
  }

  if (!(await checkProjectAccess(req.user?.id, training.projectId))) {
    throw new ForbiddenError();
  }
  if (!isWithinTokenScope(req.projectId, training.projectId)) {
    throw new ForbiddenError('Training does not belong to the token\'s project');
  }

  // Generate UUID if not provided
  const epoch_uuid = req.body.epoch_uuid || uuidv4();

  const epochData = new Epoch({
    trainingId,
    training_uuid,
    epoch_uuid,
    epoch,
    timestamp: timestamp || new Date(),
    results,
    learning_rate,
    epoch_time,
    system_info,
    metadata
  });

  const savedEpoch = await epochData.save();

  // Update training's updatedAt timestamp
  await Training.findByIdAndUpdate(trainingId, { updatedAt: new Date() });

  res.status(201).json({
    success: true,
    message: 'Epoch created successfully',
    data: savedEpoch
  });
};

// Update epoch
export const updateEpoch = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const {
    timestamp,
    results,
    learning_rate,
    epoch_time,
    metadata
  } = req.body;

  const epoch = await Epoch.findById(id);

  if (!epoch) {
    throw new NotFoundError('Epoch not found');
  }

  const training = await Training.findById(epoch.trainingId);
  if (!(await checkProjectAccess(req.user?.id, training?.projectId))) {
    throw new ForbiddenError();
  }
  if (!isWithinTokenScope(req.projectId, training?.projectId)) {
    throw new ForbiddenError('Training does not belong to the token\'s project');
  }

  // Update fields
  if (timestamp !== undefined) epoch.timestamp = timestamp;
  if (results !== undefined) epoch.results = results;
  if (learning_rate !== undefined) epoch.learning_rate = learning_rate;
  if (epoch_time !== undefined) epoch.epoch_time = epoch_time;
  if (metadata !== undefined) epoch.metadata = metadata;

  const updatedEpoch = await epoch.save();

  res.json({
    success: true,
    message: 'Epoch updated successfully',
    data: updatedEpoch
  });
};

// Create epoch from JSON file (accepts training_uuid and looks up trainingId, or accepts trainingId directly)
export const createEpochFromJson = async (req: Request, res: Response): Promise<void> => {
  const {
    trainingId,
    training_uuid,
    epoch_uuid,
    epoch,
    timestamp,
    results,
    learning_rate,
    epoch_time,
    metadata
  } = req.body;

  let training;
  let trainId: string;
  let trainUuid: string;

  // If trainingId is provided, look it up by ID
  if (trainingId) {
    training = await Training.findById(trainingId);
    if (!training) {
      throw new NotFoundError(`Training not found with id: ${trainingId}`);
    }
    trainId = trainingId;
    trainUuid = (training as any).uuid;
  }
  // Otherwise, training_uuid must be provided
  else if (training_uuid) {
    training = await Training.findOne({ uuid: training_uuid });
    if (!training) {
      throw new NotFoundError(`Training not found with uuid: ${training_uuid}`);
    }
    trainId = (training as any)._id.toString();
    trainUuid = training_uuid;
  }
  // Neither provided
  else {
    throw new BadRequestError('Either trainingId or training_uuid is required');
  }

  if (!(await checkProjectAccess(req.user?.id, (training as any).projectId))) {
    throw new ForbiddenError();
  }
  if (!isWithinTokenScope(req.projectId, (training as any).projectId)) {
    throw new ForbiddenError('Training does not belong to the token\'s project');
  }

  // Check if epoch already exists
  if (epoch_uuid) {
    const existingEpoch = await Epoch.findOne({ epoch_uuid });
    if (existingEpoch) {
      throw new ConflictError(`Epoch with uuid ${epoch_uuid} already exists`);
    }
  }

  const epochData = new Epoch({
    trainingId: trainId,
    training_uuid: trainUuid,
    epoch_uuid: epoch_uuid || uuidv4(),
    epoch,
    timestamp: timestamp || new Date(),
    results,
    learning_rate,
    epoch_time,
    metadata
  });

  const savedEpoch = await epochData.save();

  // Update training's updatedAt timestamp
  await Training.findByIdAndUpdate(trainId, { updatedAt: new Date() });

  res.status(201).json({
    success: true,
    message: 'Epoch created successfully',
    data: savedEpoch
  });
};

// Batch create epochs
export const createEpochsBatch = async (req: Request, res: Response): Promise<void> => {
  const { epochs } = req.body as { epochs: any[] };

  // Prepare epochs (shape already validated by the route's zod schema)
  const preparedEpochs: any[] = epochs.map((epoch: any) => ({
    ...epoch,
    epoch_uuid: epoch.epoch_uuid || uuidv4(),
    timestamp: epoch.timestamp || new Date()
  }));

  // Verify access to every training referenced in the batch before inserting anything
  const uniqueTrainingIds = [...new Set(preparedEpochs.map(epoch => epoch.trainingId))];
  const trainings = await Training.find({ _id: { $in: uniqueTrainingIds } });
  const trainingById = new Map(trainings.map(t => [(t._id as any).toString(), t]));
  for (const trainingId of uniqueTrainingIds) {
    const training = trainingById.get(trainingId);
    if (!training || !(await checkProjectAccess(req.user?.id, training.projectId)) || !isWithinTokenScope(req.projectId, training.projectId)) {
      throw new ForbiddenError();
    }
  }

  const savedEpochs = await Epoch.insertMany(preparedEpochs);

  await Training.updateMany(
    { _id: { $in: uniqueTrainingIds } },
    { updatedAt: new Date() }
  );

  res.status(201).json({
    success: true,
    message: `${savedEpochs.length} epochs created successfully`,
    data: savedEpochs
  });
};
