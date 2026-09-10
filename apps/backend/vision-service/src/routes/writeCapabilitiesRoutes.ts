import { Router } from 'express';
import { validateRequest } from '@visin/backend-core';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { getCapabilities, getGroups } from '../controllers/writeCapabilitiesController';
import { writeCapabilitiesQuerySchema } from '../validation/writeCapabilitiesSchemas';

const router = Router();
// Browser-session capabilities. API credentials retain their own scope checks
// on resource routes; this endpoint never authenticates a user API key.
router.get('/', optionalAuthMiddleware, validateRequest({ query: writeCapabilitiesQuerySchema }), getCapabilities);
router.get('/groups', authMiddleware, getGroups);

export default router;
