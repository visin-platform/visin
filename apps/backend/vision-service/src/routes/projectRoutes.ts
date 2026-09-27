import express from 'express';
import {
  getProjects,
  getProjectByIdOrSlug,
  createProject,
  updateProject,
  deleteProject,
  getProjectDashboardStats,
  listTrashedProjects,
  restoreProject,
  deleteProjectForever,
  transferProject
} from '../controllers/projectController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '@visin/backend-core';
import { getProjectsQuerySchema, createProjectBodySchema, updateProjectBodySchema, transferProjectBodySchema } from '../validation/projectSchemas';

const router = express.Router();

// Reads are public + private (optional auth); writes require a signed-in caller with the permission each needs.
router.get('/', optionalAuthMiddleware, validateRequest({ query: getProjectsQuerySchema }), getProjects);
// Before /:id, which would take "trash" for a slug.
router.get('/trash', authMiddleware, listTrashedProjects);
// `:id` also takes a slug; one name for all three /:id routes keeps them one path in the API docs.
router.get('/:id', optionalAuthMiddleware, getProjectByIdOrSlug);
router.get('/:id/dashboard-stats', optionalAuthMiddleware, getProjectDashboardStats);
router.post('/', authMiddleware, validateRequest({ body: createProjectBodySchema }), createProject);
router.put('/:id', authMiddleware, validateRequest({ body: updateProjectBodySchema }), updateProject);
router.delete('/:id', authMiddleware, deleteProject);
router.post('/:id/restore', authMiddleware, restoreProject);
router.delete('/:id/permanent', authMiddleware, deleteProjectForever);
router.put('/:id/owner', authMiddleware, validateRequest({ body: transferProjectBodySchema }), transferProject);

export default router;
