import express from 'express';
import { validateRequest } from '@visin/backend-core';
import {
  answerAuthorship,
  createPaper,
  deletePaper,
  getAuthorshipRequests,
  getMyPapers,
  getPaper,
  restorePaper,
  updatePaper
} from '../controllers/paperController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import {
  authorshipBodySchema,
  createPaperBodySchema,
  myPapersQuerySchema,
  updatePaperBodySchema
} from '../validation/paperSchemas';

const router = express.Router();

// A paper is read like a project: anyone may open a public one, and its owner their drafts. Everything that writes, and
// the caller's own lists, need a signed-in person: no API key reaches here (see `API_ROUTE_GROUPS`).
router.get('/', authMiddleware, validateRequest({ query: myPapersQuerySchema }), getMyPapers);
// Before /:id, which would take these for ids.
router.get('/authorship-requests', authMiddleware, getAuthorshipRequests);
router.get('/:id', optionalAuthMiddleware, getPaper);
router.post('/', authMiddleware, validateRequest({ body: createPaperBodySchema }), createPaper);
router.put('/:id', authMiddleware, validateRequest({ body: updatePaperBodySchema }), updatePaper);
router.delete('/:id', authMiddleware, deletePaper);
router.post('/:id/restore', authMiddleware, restorePaper);
router.put('/:id/authorship', authMiddleware, validateRequest({ body: authorshipBodySchema }), answerAuthorship);

export default router;
