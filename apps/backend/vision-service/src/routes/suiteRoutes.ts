import express from 'express';
import { validateRequest } from '@visin/backend-core';
import { checkSuite, createSuite, getSuite, getSuiteLeaderboard, getSuiteSubmissions, getSuites, updateSuite } from '../controllers/suiteController';
import { suiteLeaderboardQuerySchema } from '../validation/evaluationSchemas';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import {
  checkSuiteBodySchema,
  createSuiteBodySchema,
  listSuitesQuerySchema,
  suiteParamsSchema,
  suiteUpdateParamsSchema,
  updateSuiteBodySchema
} from '../validation/suiteSchemas';

const router = express.Router();

// Reads work signed out (a public suite is a protocol anyone may run); writes need a login.
router.get('/', optionalAuthMiddleware, validateRequest({ query: listSuitesQuerySchema }), getSuites);
router.get('/:slug/:version', optionalAuthMiddleware, validateRequest({ params: suiteParamsSchema }), getSuite);
router.get(
  '/:slug/:version/leaderboard',
  optionalAuthMiddleware,
  validateRequest({ params: suiteParamsSchema, query: suiteLeaderboardQuerySchema }),
  getSuiteLeaderboard
);
router.get('/:slug/:version/submissions', authMiddleware, validateRequest({ params: suiteUpdateParamsSchema }), getSuiteSubmissions);
router.post('/', authMiddleware, validateRequest({ body: createSuiteBodySchema }), createSuite);
router.post('/check', authMiddleware, validateRequest({ body: checkSuiteBodySchema }), checkSuite);
router.patch(
  '/:slug/:version',
  authMiddleware,
  validateRequest({ params: suiteUpdateParamsSchema, body: updateSuiteBodySchema }),
  updateSuite
);

export default router;
