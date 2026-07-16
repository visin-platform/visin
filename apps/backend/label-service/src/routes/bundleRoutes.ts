import { Router } from 'express';
import { asyncHandler, validateRequest } from '@visin/backend-core';
import { createBundleBodySchema, startImportBodySchema } from '../validation/bundleSchemas';
import * as ctrl from '../controllers/bundleController';

const router = Router();

router.post('/', validateRequest({ body: createBundleBodySchema }), asyncHandler(ctrl.createBundle));
router.get('/', asyncHandler(ctrl.listBundles));
router.get('/:id', asyncHandler(ctrl.getBundle));
router.post('/:id/upload-url', asyncHandler(ctrl.createUploadUrl));
router.post('/:id/import', validateRequest({ body: startImportBodySchema }), asyncHandler(ctrl.startImport));
router.get('/:id/import/:importId', asyncHandler(ctrl.getImport));
router.delete('/:id/import/:importId', asyncHandler(ctrl.deleteImport));
router.delete('/:id', asyncHandler(ctrl.deleteBundle));

export default router;
