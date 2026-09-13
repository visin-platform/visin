import { Router } from 'express';
import { asyncHandler, authenticateToken, validateRequest } from '@visin/backend-core';
import {
  createBundleBodySchema,
  maskFieldsQuerySchema,
  previewImportBodySchema,
  startImportBodySchema,
  updateBundleBodySchema
} from '../validation/bundleSchemas';
import * as ctrl from '../controllers/bundleController';

const router = Router();

// Listing and reading a bundle enforce its visibility (group membership, or a
// publicly shared job built on it). Everything that changes a bundle, or reads
// what only its administrators see — uploads, imports, the wizard's mask fields —
// carries `authenticateToken`, so an anonymous caller is turned away at the door
// rather than inside a controller.
router.post('/', authenticateToken, validateRequest({ body: createBundleBodySchema }), asyncHandler(ctrl.createBundle));
router.get('/', asyncHandler(ctrl.listBundles));
router.get('/:id', asyncHandler(ctrl.getBundle));
router.patch(
  '/:id',
  authenticateToken,
  validateRequest({ body: updateBundleBodySchema }),
  asyncHandler(ctrl.updateBundle)
);
// Groupable mask metadata in one annotation set — what a job wizard slices on.
router.get(
  '/:id/mask-fields',
  authenticateToken,
  validateRequest({ query: maskFieldsQuerySchema }),
  asyncHandler(ctrl.maskFields)
);
router.post('/:id/upload-url', authenticateToken, asyncHandler(ctrl.createUploadUrl));
// Uploaded zips outlive a failed import, so one can be re-imported without re-sending it.
router.get('/:id/uploads', authenticateToken, asyncHandler(ctrl.listUploads));
// Preview first (the mapping step), then import with the mapping it produced.
router.post(
  '/:id/import/preview',
  authenticateToken,
  validateRequest({ body: previewImportBodySchema }),
  asyncHandler(ctrl.previewImport)
);
router.post(
  '/:id/import',
  authenticateToken,
  validateRequest({ body: startImportBodySchema }),
  asyncHandler(ctrl.startImport)
);
router.get('/:id/import/:importId', authenticateToken, asyncHandler(ctrl.getImport));
router.delete('/:id/import/:importId', authenticateToken, asyncHandler(ctrl.deleteImport));
router.delete('/:id', authenticateToken, asyncHandler(ctrl.deleteBundle));

export default router;
