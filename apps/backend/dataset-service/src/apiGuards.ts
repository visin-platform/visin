import type { RequestHandler } from 'express';
import { apiKeyAuth, ForbiddenError, optionalAuth } from '@visin/backend-core';
import { projectDatasetOwner } from './clients/projectServiceClient';

/** A pipeline key reads public datasets and those belonging to its project's live owner. */
const pipelineDatasetAccess: RequestHandler = async (req, res, next) => {
  if (!req.apiKey?.projectId) return next();
  if (req.path === '/groups' || req.path === '/trash') throw new ForbiddenError('Pipeline keys only read live datasets');
  res.locals.pipelineDatasetOwner = await projectDatasetOwner(req.apiKey.projectId, req.user!.id);
  next();
};

export const datasetApiGuards = [apiKeyAuth('dataset', { projectLimitedDatasetReads: true }), optionalAuth, pipelineDatasetAccess];
