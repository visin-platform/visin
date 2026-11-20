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
import {
  deleteUploadedPdf,
  getPaperDocument,
  refreshPaperDocument,
  streamPaperPdf,
  uploadPdf
} from '../controllers/paperDocumentController';
import { MAX_UPLOAD_BYTES } from '../services/paperDocumentService';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import {
  authorshipBodySchema,
  createPaperBodySchema,
  myPapersQuerySchema,
  updatePaperBodySchema
} from '../validation/paperSchemas';

const router = express.Router();

/** The PDF as the raw request body, up to the upload limit (a larger one is a 413); any other content type is left unread. */
const pdfBody = express.raw({ type: 'application/pdf', limit: MAX_UPLOAD_BYTES });

// A paper is read like a project: anyone may open a public one, and its owner their drafts. Everything that writes, and
// the caller's own lists, need a signed-in person: no API key reaches here (see `API_ROUTE_GROUPS`).
router.get('/', authMiddleware, validateRequest({ query: myPapersQuerySchema }), getMyPapers);
// Before /:id, which would take these for ids.
router.get('/authorship-requests', authMiddleware, getAuthorshipRequests);
router.get('/:id', optionalAuthMiddleware, getPaper);
router.get('/:id/document', optionalAuthMiddleware, getPaperDocument);
router.get('/:id/pdf', optionalAuthMiddleware, streamPaperPdf);
router.put('/:id/pdf', authMiddleware, pdfBody, uploadPdf);
router.delete('/:id/pdf', authMiddleware, deleteUploadedPdf);
router.post('/:id/document/refresh', authMiddleware, refreshPaperDocument);
router.post('/', authMiddleware, validateRequest({ body: createPaperBodySchema }), createPaper);
router.put('/:id', authMiddleware, validateRequest({ body: updatePaperBodySchema }), updatePaper);
router.delete('/:id', authMiddleware, deletePaper);
router.post('/:id/restore', authMiddleware, restorePaper);
router.put('/:id/authorship', authMiddleware, validateRequest({ body: authorshipBodySchema }), answerAuthorship);

export default router;
