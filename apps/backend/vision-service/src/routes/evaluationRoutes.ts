import express from 'express';
import { validateRequest } from '@visin/backend-core';
import {
  approveEvaluation,
  verifyEvaluation,
  checkEvaluation,
  createEvaluation,
  getEvaluation,
  getEvaluationByUuid,
  getEvaluations,
  getRecordedLeaderboard,
  hideEvaluation,
  promoteEvaluation,
  publishEvaluation,
  restoreEvaluation,
  trashEvaluation,
  unhideEvaluation,
  withdrawEvaluation
} from '../controllers/evaluationController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import {
  evaluationBodySchema,
  verifyEvaluationBodySchema,
  recordedLeaderboardQuerySchema,
  evaluationUuidQuerySchema,
  hideEvaluationBodySchema,
  listEvaluationsQuerySchema,
  promoteEvaluationBodySchema
} from '../validation/evaluationSchemas';

const router = express.Router();

// Reads are scoped to the projects the caller can read, signed in or not; writes need a login.
// Static paths before `/:id`.
router.get('/', optionalAuthMiddleware, validateRequest({ query: listEvaluationsQuerySchema }), getEvaluations);
router.get('/leaderboard', optionalAuthMiddleware, validateRequest({ query: recordedLeaderboardQuerySchema }), getRecordedLeaderboard);
router.get('/uuid/:uuid', optionalAuthMiddleware, validateRequest({ query: evaluationUuidQuerySchema }), getEvaluationByUuid);
router.post('/check', authMiddleware, validateRequest({ body: evaluationBodySchema }), checkEvaluation);
router.post('/promote', authMiddleware, validateRequest({ body: promoteEvaluationBodySchema }), promoteEvaluation);
router.post('/', authMiddleware, validateRequest({ body: evaluationBodySchema }), createEvaluation);
router.get('/:id', optionalAuthMiddleware, getEvaluation);
router.delete('/:id', authMiddleware, trashEvaluation);
router.post('/:id/restore', authMiddleware, restoreEvaluation);
router.post('/:id/publish', authMiddleware, publishEvaluation);
router.post('/:id/verification', authMiddleware, validateRequest({ body: verifyEvaluationBodySchema }), verifyEvaluation);
router.post('/:id/withdraw', authMiddleware, withdrawEvaluation);
// A manager of the suite's own project decides what stands on its public leaderboard.
router.post('/:id/approve', authMiddleware, approveEvaluation);
router.post('/:id/hide', authMiddleware, validateRequest({ body: hideEvaluationBodySchema }), hideEvaluation);
router.post('/:id/unhide', authMiddleware, unhideEvaluation);

export default router;
