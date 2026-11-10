import { Router } from 'express';
import { validateRequest } from '@visin/backend-core';
import { forwardTo } from '../controllers/forwardController';
import { userKeyParamsSchema, userParamsSchema, userSessionParamsSchema } from '../validation/adminSchemas';

/** Accounts, sessions, API keys and recovery: owned by auth-service. */
const router = Router();
const auth = forwardTo('auth');
const user = validateRequest({ params: userParamsSchema });

router.get('/users', auth);
router.post('/users', auth);
// Before `/users/:id`, which would take "lookup" for an id.
router.get('/users/lookup', auth);
router.get('/users/:id', user, auth);
router.put('/users/:id', user, auth);
router.get('/users/:id/memberships', user, auth);
router.post('/users/:id/password', user, auth);
router.get('/users/:id/sessions', user, auth);
router.post('/users/:id/revoke-sessions', user, auth);
router.delete('/users/:id/sessions/:sessionId', validateRequest({ params: userSessionParamsSchema }), auth);
router.get('/users/:id/keys', user, auth);
router.delete('/users/:id/keys/:keyId', validateRequest({ params: userKeyParamsSchema }), auth);

export default router;
