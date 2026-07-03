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

const router = express.Router();

// Reads are public + private (optional auth); writes require a logged-in owner.
router.get('/', optionalAuthMiddleware, getProjects);
router.get('/:identifier', optionalAuthMiddleware, getProjectByIdOrSlug);
router.get('/:id/dashboard-stats', optionalAuthMiddleware, getProjectDashboardStats);
router.post('/', authMiddleware, createProject);
router.put('/:id', authMiddleware, updateProject);
router.delete('/:id', authMiddleware, deleteProject);

export default router;
