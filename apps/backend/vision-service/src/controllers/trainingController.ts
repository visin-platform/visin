import { heartbeatTraining as recordHeartbeat } from '../services/trainingHeartbeatService';
import { Request, Response } from 'express';
import { logger, sendStoredFile } from '@visin/backend-core';
import {
  addModelReference,
  createModelUpload,
  removeModelReference,
  servableModel,
  setModelDemo
} from '../services/trainingModelService';
import { reprDigest } from '../services/visinModels';
import { getFileStream } from '../clients/fileServiceClient';
import { getBestRun } from '../services/bestRunService';
import type { BestRunQuery } from '../validation/bestRunSchemas';
import { getTrainingSummary } from '../services/trainingSummaryService';
import { buildModelCard } from '../services/modelCardService';
import type { ModelBundleQuery, ModelCardQuery, ModelUploadBody } from '../validation/artifactSchemas';
import { openModelBundle } from '../services/modelBundleService';
import { AuthRequest } from '../middleware/authMiddleware';
import { trainingService } from '../services/trainingService';
import type {
  GetDeletedTrainingsQuery,
  GetTrainingsQuery,
  GetTrainingStatsQuery,
  GetTrainingWithEpochsQuery
} from '../validation/trainingSchemas';

// Get all trainings
export const getTrainings = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { page, limit, search, status, datasetId, dataset, projectId, access, tags, excludeTags, ids, sortBy, order } =
    req.query as unknown as GetTrainingsQuery;

  const result = await trainingService.getTrainings(
    userId,
    { search, status, datasetId: datasetId ?? dataset, projectId, access, tags, excludeTags, ids },
    { page, limit, sortBy, order }
  );

  res.json({
    success: true,
    data: result
  });
};

// Every tag in use on the runs the caller can see
export const getTrainingTags = async (req: AuthRequest, res: Response): Promise<void> => {
  const tags = await trainingService.getTrainingTags(req.user?.id);

  res.json({
    success: true,
    data: tags
  });
};

// Get training by ID
export const getTrainingById = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const userId = req.user?.id;

  const training = await trainingService.getTrainingById(id, userId);

  res.json({
    success: true,
    data: training
  });
};

// Get training by UUID
export const getTrainingByUuid = async (req: AuthRequest, res: Response): Promise<void> => {
  const uuid = req.params.uuid as string;
  const userId = req.user?.id;

  const training = await trainingService.getTrainingByUuid(uuid, userId);

  res.json({
    success: true,
    data: training
  });
};

// Get training with epochs
export const getTrainingWithEpochs = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { sortBy, order, sample } = req.query as unknown as GetTrainingWithEpochsQuery;

  const result = await trainingService.getTrainingWithEpochs(id as string, userId, sortBy, order, sample);

  res.json({
    success: true,
    data: result
  });
};

// Create training
export const createTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;

  // Determine effective projectId: API tokens take precedence, otherwise use request body
  const effectiveProjectId = req.projectId || req.body.projectId;

  const trainingData = {
    ...req.body,
    projectId: effectiveProjectId
  };

  const savedTraining = await trainingService.createTraining(userId, trainingData);

  res.status(201).json({
    success: true,
    message: 'Training created successfully',
    data: savedTraining
  });
};

// Update training
export const updateTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;
  const updatedTraining = await trainingService.updateTraining(id as string, userId, req.body);

  res.json({
    success: true,
    message: 'Training updated successfully',
    data: updatedTraining
  });
};

// Delete training
export const deleteTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;
  await trainingService.deleteTraining(id as string, userId);

  res.json({
    success: true,
    message: 'Training and associated data deleted successfully'
  });
};

// Get deleted trainings the caller could restore
export const getDeletedTrainings = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit } = req.query as unknown as GetDeletedTrainingsQuery;
  const result = await trainingService.getDeletedTrainings(req.user!.id, { page, limit });

  res.json({
    success: true,
    data: result
  });
};

// Restore a deleted training with the epochs and test results its delete removed
export const restoreTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const training = await trainingService.restoreTraining(id as string, req.user!.id);

  res.json({
    success: true,
    message: 'Training restored successfully',
    data: training
  });
};

// Get training statistics
export const getTrainingStats = async (req: Request, res: Response): Promise<void> => {
  const { status, datasetId, projectId, tags } = req.query as unknown as GetTrainingStatsQuery;

  const result = await trainingService.getTrainingStats(req.user?.id, { status, datasetId, projectId, tags });

  res.json({
    success: true,
    data: result
  });
};

// Compare trainings
export const compareTrainings = async (req: Request, res: Response): Promise<void> => {
  const { trainingIds } = req.body;
  const result = await trainingService.compareTrainings(req.user?.id, trainingIds);

  res.json({
    success: true,
    data: result
  });
};

export const heartbeatTraining = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await recordHeartbeat(String(req.params.id), req.user?.id) });
};

// Link a Hub model to a run
export const addTrainingModel = async (req: Request, res: Response): Promise<void> => {
  const { created, models } = await addModelReference(String(req.params.id), req.user?.id, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: models });
};

// Reserve an upload for a model file of this run
export const createTrainingModelUpload = async (req: Request, res: Response): Promise<void> => {
  const data = await createModelUpload(String(req.params.id), req.user?.id, req.body as ModelUploadBody);
  res.status(201).json({ success: true, data });
};

/**
 * A stored model's file as the response, resumable, for a caller that takes one response as the data (a dataspace
 * connector's data plane) and follows no link inside it.
 */
export const downloadTrainingModel = async (req: AuthRequest, res: Response): Promise<void> => {
  const training = await trainingService.getTrainingById(String(req.params.id), req.user?.id);
  const model = servableModel(training, String(req.params.modelId));
  // A resume is not a second download: count the request that starts at the beginning.
  if (req.method === 'GET' && (!req.headers.range || /^bytes=0-/.test(req.headers.range))) {
    logger.info('Model downloaded', {
      trainingId: String(training._id),
      modelId: String(model._id),
      format: model.format,
      userId: req.user?.id,
      keyId: req.apiKey?.keyId,
      bytes: model.size
    });
  }
  await sendStoredFile(req, res, {
    filename: model.filename ?? `model.${model.format}`,
    contentType: 'application/octet-stream',
    size: model.size,
    version: model.verifiedAt ?? training.updatedAt,
    headers: { 'Repr-Digest': reprDigest(model.sha256!) },
    open: (range) => getFileStream(model.fileId, range),
    logContext: { trainingId: String(training._id), modelId: String(model._id) }
  });
};

/**
 * What a stored model produced on its frames, as one zip, for a caller that takes one response as the data. Built as
 * it is sent, so it has no size and no ranges; the weights are the separate `file` download.
 */
export const downloadModelBundle = async (req: AuthRequest, res: Response): Promise<void> => {
  const training = await trainingService.getTrainingById(String(req.params.id), req.user?.id);
  const { folders } = req.query as unknown as ModelBundleQuery;
  const bundle = await openModelBundle(training, String(req.params.modelId), folders, req.user?.id);
  if (req.method === 'GET') {
    logger.info('Model outputs downloaded', {
      trainingId: String(training._id),
      modelId: String(bundle.model._id),
      userId: req.user?.id
    });
  }
  await sendStoredFile(req, res, {
    filename: bundle.filename,
    contentType: 'application/zip',
    headers: { 'Cache-Control': 'no-store' },
    open: async () => bundle.stream(),
    logContext: { trainingId: String(training._id), modelId: String(bundle.model._id) }
  });
};

// Unlink a model from a run
export const removeTrainingModel = async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await removeModelReference(String(req.params.id), req.user?.id, String(req.params.modelId))
  });
};

// The README for a Hub model repo, written from what this run recorded
export const getModelCard = async (req: Request, res: Response): Promise<void> => {
  const readme = await buildModelCard(String(req.params.id), req.user?.id, req.query as unknown as ModelCardQuery);
  res.json({ success: true, data: { readme } });
};

// Link, or unlink, a model's demo Space
export const setTrainingModelDemo = async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await setModelDemo(String(req.params.id), req.user?.id, String(req.params.modelId), req.body.space)
  });
};

// How a run did, in one call
export const getSummary = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getTrainingSummary(String(req.params.id), req.user?.id) });
};

// The run that did best on a project or a dataset
export const getBest = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getBestRun(req.user?.id, req.query as unknown as BestRunQuery) });
};
