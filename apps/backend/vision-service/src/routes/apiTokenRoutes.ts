import express from 'express';
import { createToken, getTokens, revokeToken } from '../controllers/apiTokenController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { createTokenBodySchema } from '../validation/apiTokenSchemas';

const router = express.Router();

// All routes require authentication (JWT)
router.use(authMiddleware);

router.post('/', validateRequest({ body: createTokenBodySchema }), createToken);
router.get('/project/:projectId', getTokens);
router.delete('/:id', revokeToken);

export default router;
