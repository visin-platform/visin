import express from 'express';
import {
  getProjects,
  getProjectByIdOrSlug,
  createProject,
  updateProject,
  deleteProject,
  getProjectDashboardStats
} from '../controllers/projectController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

router.get('/', getProjects);
router.get('/:identifier', getProjectByIdOrSlug);
router.get('/:id/dashboard-stats', getProjectDashboardStats);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
