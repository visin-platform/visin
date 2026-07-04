import express from 'express';
import {
  getProjects,
  getProjectByIdOrSlug,
  createProject,
  updateProject,
  deleteProject,
  getProjectDashboardStats
} from '../controllers/projectController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { getProjectsQuerySchema, createProjectBodySchema, updateProjectBodySchema } from '../validation/projectSchemas';

const router = express.Router();

// Reads are public + private (optional auth); writes require a logged-in owner.
router.get('/', optionalAuthMiddleware, validateRequest({ query: getProjectsQuerySchema }), getProjects);
router.get('/:identifier', optionalAuthMiddleware, getProjectByIdOrSlug);
router.get('/:id/dashboard-stats', optionalAuthMiddleware, getProjectDashboardStats);
router.post('/', authMiddleware, validateRequest({ body: createProjectBodySchema }), createProject);
router.put('/:id', authMiddleware, validateRequest({ body: updateProjectBodySchema }), updateProject);
router.delete('/:id', authMiddleware, deleteProject);

export default router;
