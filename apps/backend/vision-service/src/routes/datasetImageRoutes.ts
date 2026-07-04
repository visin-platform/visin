import express from 'express';
import {
  createDatasetImage,
  getAllImages,
  getImagesByDataset,
  getImageById,
  updateImage,
  deleteImage,
  exportImageNames
} from '../controllers/datasetImageController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import {
  getAllImagesQuerySchema,
  getImagesByDatasetQuerySchema,
  createDatasetImageBodySchema,
  updateImageBodySchema,
  exportImageNamesQuerySchema
} from '../validation/datasetImageSchemas';

const router = express.Router();

// Dataset images are a shared library (no owner/project scoping), so reads
// stay public; writes require a logged-in user.
router.get('/', validateRequest({ query: getAllImagesQuerySchema }), getAllImages);
router.get('/dataset/:datasetId', validateRequest({ query: getImagesByDatasetQuerySchema }), getImagesByDataset);
router.get('/:id', getImageById);
router.post('/', authMiddleware, validateRequest({ body: createDatasetImageBodySchema }), createDatasetImage);
router.put('/:id', authMiddleware, validateRequest({ body: updateImageBodySchema }), updateImage);
router.delete('/:id', authMiddleware, deleteImage);
router.get('/export-names/:datasetId', validateRequest({ query: exportImageNamesQuerySchema }), exportImageNames);

export default router;