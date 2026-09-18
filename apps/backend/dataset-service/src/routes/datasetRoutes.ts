import { Router } from 'express';
import { authenticateToken, validateRequest } from '@visin/backend-core';
import * as ctrl from '../controllers/datasetController';
import {
  archiveUploadBodySchema,
  createDatasetBodySchema,
  listDatasetsQuerySchema,
  listItemsQuerySchema,
  startImportBodySchema,
  updateDatasetBodySchema
} from '../validation/datasetSchemas';

const router = Router();

// Reads enforce dataset visibility inside the service (public, or a group the
// caller belongs to). Everything that changes a dataset carries
// `authenticateToken`, so an anonymous caller is turned away at the door.
router.get('/', validateRequest({ query: listDatasetsQuerySchema }), ctrl.listDatasets);
router.post('/', authenticateToken, validateRequest({ body: createDatasetBodySchema }), ctrl.createDataset);
// Before `/:id`, which would otherwise read "groups" as a dataset id.
router.get('/groups', authenticateToken, ctrl.listMyGroups);
router.get('/:id', ctrl.getDataset);
router.patch('/:id', authenticateToken, validateRequest({ body: updateDatasetBodySchema }), ctrl.updateDataset);
router.delete('/:id', authenticateToken, ctrl.deleteDataset);

// Upload is two calls around a browser-direct chunked PUT to file-service.
router.post('/:id/archive/upload-url', authenticateToken, validateRequest({ body: archiveUploadBodySchema }), ctrl.createArchiveUpload);
router.post('/:id/archive/complete', authenticateToken, ctrl.completeArchiveUpload);
router.post('/:id/archive/scan', authenticateToken, ctrl.rescanArchive);
router.get('/:id/download', ctrl.downloadArchive);

router.post('/:id/import', authenticateToken, validateRequest({ body: startImportBodySchema }), ctrl.startImport);
router.delete('/:id/import', authenticateToken, ctrl.cancelImport);

router.get('/:id/items', validateRequest({ query: listItemsQuerySchema }), ctrl.listItems);
router.get('/:id/items/:itemId', ctrl.getItem);

export default router;
