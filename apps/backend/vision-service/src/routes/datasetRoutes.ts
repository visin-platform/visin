import express from 'express';
import {
  getDatasets,
  getDatasetById,
  getDatasetByUuid,
  createDataset,
  getLabelingStats,
  downloadDataset,
  getSignedUrlForPath
} from '../controllers/datasetController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { getDatasetsQuerySchema, createDatasetBodySchema, getSignedUrlForPathQuerySchema } from '../validation/datasetSchemas';

const router = express.Router();

// Datasets are a shared library (no owner/project scoping), so reads stay
// public; writes require a logged-in user.
router.get('/', validateRequest({ query: getDatasetsQuerySchema }), getDatasets);
router.get('/labeling-stats', getLabelingStats);
router.get('/signed-url', validateRequest({ query: getSignedUrlForPathQuerySchema }), getSignedUrlForPath);
router.get('/:id', getDatasetById);
router.get('/uuid/:uuid', getDatasetByUuid);
router.post('/', authMiddleware, validateRequest({ body: createDatasetBodySchema }), createDataset);
router.get('/download/:uuid', downloadDataset);

export default router;
