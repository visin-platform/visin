import express from 'express';
import { validateRequest } from '@visin/backend-core';
import { getPaperForAssistant, readPaper, searchPaper } from '../controllers/paperDocumentController';
import { optionalAuthMiddleware } from '../middleware/authMiddleware';
import { paperPagesQuerySchema, paperSearchQuerySchema } from '../validation/paperSchemas';

const router = express.Router();

// Read-only, for an assistant acting for a person (an API key with `vision:read`). It reads a paper exactly as that
// person could, and nothing here changes one: papers stay people's to curate, through the routes no key reaches.
router.get('/:id', optionalAuthMiddleware, getPaperForAssistant);
router.get('/:id/search', optionalAuthMiddleware, validateRequest({ query: paperSearchQuerySchema }), searchPaper);
router.get('/:id/pages', optionalAuthMiddleware, validateRequest({ query: paperPagesQuerySchema }), readPaper);

export default router;
