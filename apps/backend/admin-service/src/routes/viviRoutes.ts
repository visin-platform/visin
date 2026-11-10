import { Router } from 'express';
import { validateRequest } from '@visin/backend-core';
import { forwardTo } from '../controllers/forwardController';
import { policyParamsSchema, providerKeyParamsSchema, runParamsSchema } from '../validation/adminSchemas';

/** Vivi setup, provider keys and prices, access policies and runs: owned by chat-service. */
const router = Router();
const vivi = forwardTo('vivi');
const policy = validateRequest({ params: policyParamsSchema });
const providerKey = validateRequest({ params: providerKeyParamsSchema });

router.get('/vivi/capabilities', vivi);

router.get('/vivi/settings/assistant', vivi);
router.put('/vivi/settings/assistant', vivi);
router.get('/vivi/settings/assistant/models', vivi);
router.get('/vivi/settings/assistant/usage', vivi);
router.put('/vivi/settings/assistant/prices', vivi);
router.post('/vivi/settings/assistant/prices/backfill', vivi);
router.post('/vivi/settings/assistant/prices/refresh', vivi);
router.put('/vivi/settings/assistant/keys/:provider', providerKey, vivi);
router.delete('/vivi/settings/assistant/keys/:provider', providerKey, vivi);

router.get('/vivi/admin/policies{/:id}', policy, vivi);
router.put('/vivi/admin/policies{/:id}', policy, vivi);
router.get('/vivi/admin/runs', vivi);
router.post('/vivi/admin/runs/:id/cancel', validateRequest({ params: runParamsSchema }), vivi);
router.get('/vivi/admin/profile', vivi);
router.put('/vivi/admin/profile', vivi);

export default router;
