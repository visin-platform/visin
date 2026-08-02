import { Router } from 'express';
import { asyncHandler, validateRequest } from '@visin/backend-core';
import {
  createBundleBodySchema,
  maskFieldsQuerySchema,
  previewImportBodySchema,
  startImportBodySchema,
  updateBundleBodySchema
} from '../validation/bundleSchemas';
import * as ctrl from '../controllers/bundleController';

const router = Router();

router.post('/', validateRequest({ body: createBundleBodySchema }), asyncHandler(ctrl.createBundle));
router.get('/', asyncHandler(ctrl.listBundles));
router.get('/:id', asyncHandler(ctrl.getBundle));
router.patch('/:id', validateRequest({ body: updateBundleBodySchema }), asyncHandler(ctrl.updateBundle));
// Groupable mask metadata in one annotation set — what a job wizard slices on.
router.get('/:id/mask-fields', validateRequest({ query: maskFieldsQuerySchema }), asyncHandler(ctrl.maskFields));
router.post('/:id/upload-url', asyncHandler(ctrl.createUploadUrl));
// Uploaded zips outlive a failed import, so one can be re-imported without re-sending it.
router.get('/:id/uploads', asyncHandler(ctrl.listUploads));
// Preview first (the mapping step), then import with the mapping it produced.
router.post('/:id/import/preview', validateRequest({ body: previewImportBodySchema }), asyncHandler(ctrl.previewImport));
router.post('/:id/import', validateRequest({ body: startImportBodySchema }), asyncHandler(ctrl.startImport));
router.get('/:id/import/:importId', asyncHandler(ctrl.getImport));
router.delete('/:id/import/:importId', asyncHandler(ctrl.deleteImport));
router.delete('/:id', asyncHandler(ctrl.deleteBundle));

export default router;
