import { Router } from 'express';
import { requireInternalServiceToken, validateRequest } from '@visin/backend-core';
import * as ctrl from '../controllers/internalController';
import { resolveDatasetBodySchema, internalItemsQuerySchema, internalListQuerySchema, jsonFieldsQuerySchema } from '../validation/datasetSchemas';

const router = Router();

// Service-to-service only: these answer with storage file ids and JSON content.
router.use(requireInternalServiceToken);

router.get('/datasets', validateRequest({ query: internalListQuerySchema }), ctrl.listDatasets);
router.get('/groups/:groupId/owned', ctrl.getOwnedByGroup);
// Before `/:id`, which would otherwise read "ids" as a dataset id.
router.post('/datasets/resolve', validateRequest({ body: resolveDatasetBodySchema }), ctrl.resolveDataset);
router.get('/datasets/ids', validateRequest({ query: internalListQuerySchema }), ctrl.listIds);
router.get('/datasets/:id', ctrl.getDataset);
router.get('/datasets/:id/permission', ctrl.getPermission);
router.get('/datasets/:id/items', validateRequest({ query: internalItemsQuerySchema }), ctrl.listItems);
router.get('/datasets/:id/json-fields', validateRequest({ query: jsonFieldsQuerySchema }), ctrl.jsonFields);
router.get('/datasets/:id/manifest', ctrl.getManifest);
// A hold is another service's claim on the dataset's files (a label job showing
// them); while any exist, delete / replace zip / re-import are refused.
router.put('/datasets/:id/holds/:service/:ref', ctrl.addHold);
router.delete('/datasets/:id/holds/:service/:ref', ctrl.removeHold);

export default router;
