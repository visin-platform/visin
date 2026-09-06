import express from 'express';
import { validateRequest } from '@visin/backend-core';
import {
  createFinding,
  deleteFinding,
  exportFinding,
  getFindingById,
  getFindings
} from '../controllers/findingController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import {
  createFindingBodySchema,
  exportFindingQuerySchema,
  listFindingsQuerySchema
} from '../validation/findingSchemas';

const router = express.Router();

// Reads follow the project: a finding on a public project is public, one on a
// private project is invisible. Writes require a signed-in owner.
router.get('/', optionalAuthMiddleware, validateRequest({ query: listFindingsQuerySchema }), getFindings);
router.get('/:id', optionalAuthMiddleware, getFindingById);
// Safe to declare after `/:id`: that route matches a single segment, so it
// never swallows this two-segment path.
router.get(
  '/:id/latex',
  optionalAuthMiddleware,
  validateRequest({ query: exportFindingQuerySchema }),
  exportFinding
);
router.post('/', authMiddleware, validateRequest({ body: createFindingBodySchema }), createFinding);
router.delete('/:id', authMiddleware, deleteFinding);

export default router;
