import express from 'express';
import { validateRequest } from '@visin/backend-core';
import {
  createFinding,
  deleteFinding,
  getFindingById,
  getFindings
} from '../controllers/findingController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { createFindingBodySchema, listFindingsQuerySchema } from '../validation/findingSchemas';

const router = express.Router();

// Reads follow the project: a finding on a public project is public, one on a
// private project is invisible. Writes require a signed-in owner.
router.get('/', optionalAuthMiddleware, validateRequest({ query: listFindingsQuerySchema }), getFindings);
router.get('/:id', optionalAuthMiddleware, getFindingById);
router.post('/', authMiddleware, validateRequest({ body: createFindingBodySchema }), createFinding);
router.delete('/:id', authMiddleware, deleteFinding);

export default router;
