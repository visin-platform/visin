import { Router } from 'express';
import { authenticateToken, validateRequest } from '@visin/backend-core';
import * as ctrl from '../controllers/datasetController';
import {
  activityQuerySchema,
  archiveUploadBodySchema,
  setCoverBodySchema,
  createDatasetBodySchema,
  listDatasetsQuerySchema,
  listItemsQuerySchema,
  startImportBodySchema,
  transferDatasetBodySchema,
  updateDatasetBodySchema
} from '../validation/datasetSchemas';

const router = Router();

// Reads enforce dataset visibility inside the service (public, the caller's own,
// or a group the caller belongs to). Everything that changes a dataset carries
// `authenticateToken`, so an anonymous caller is turned away at the door.
router.get('/', validateRequest({ query: listDatasetsQuerySchema }), ctrl.listDatasets);
router.post('/', authenticateToken, validateRequest({ body: createDatasetBodySchema }), ctrl.createDataset);
// Before `/:id`, which would otherwise read "groups" or "trash" as a dataset id.
router.get('/activity', validateRequest({ query: activityQuerySchema }), ctrl.getActivity);
// What a chat or a feed unfurls for a link to a public dataset.
router.get('/share/:id', ctrl.getShare);
router.get('/sitemap.xml', ctrl.getSitemap);
// The licences a form offers; the same for everyone.
router.get('/licenses', ctrl.listLicenses);
router.get('/groups', authenticateToken, ctrl.listMyGroups);
router.get('/trash', authenticateToken, ctrl.listTrash);
router.get('/:id', ctrl.getDataset);
router.patch('/:id', authenticateToken, validateRequest({ body: updateDatasetBodySchema }), ctrl.updateDataset);
// Delete moves it to the trash; its owner restores it or deletes it for good.
router.delete('/:id', authenticateToken, ctrl.trashDataset);
router.post('/:id/restore', authenticateToken, ctrl.restoreDataset);
router.delete('/:id/permanent', authenticateToken, ctrl.deletePermanently);
router.put('/:id/owner', authenticateToken, validateRequest({ body: transferDatasetBodySchema }), ctrl.transferDataset);
router.delete('/:id/groups/:group', authenticateToken, ctrl.removeGroup);
router.put('/:id/cover', authenticateToken, validateRequest({ body: setCoverBodySchema }), ctrl.setCover);

// Upload is two calls around a browser-direct chunked PUT to file-service.
router.post('/:id/archive/upload-url', authenticateToken, validateRequest({ body: archiveUploadBodySchema }), ctrl.createArchiveUpload);
router.post('/:id/archive/complete', authenticateToken, ctrl.completeArchiveUpload);
router.delete('/:id/archive/upload', authenticateToken, ctrl.discardArchiveUpload);
router.post('/:id/archive/scan', authenticateToken, ctrl.rescanArchive);
router.get('/:id/download', ctrl.downloadArchive);
router.get('/:id/hub', ctrl.hubInfo);

router.post('/:id/import', authenticateToken, validateRequest({ body: startImportBodySchema }), ctrl.startImport);
router.delete('/:id/import', authenticateToken, ctrl.cancelImport);
router.post('/:id/import/resume', authenticateToken, ctrl.resumeImport);

router.get('/:id/items', validateRequest({ query: listItemsQuerySchema }), ctrl.listItems);
router.get('/:id/items/:itemId', ctrl.getItem);

export default router;
